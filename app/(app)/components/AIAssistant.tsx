"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CATEGORIES } from "../lib/categories";
import { formatDateMDY } from "../lib/date";
import { matchRecurringForTransaction } from "../lib/recurring";
import { assertDateIsInCurrentMonth } from "../lib/monthLock";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  typing?: boolean;
};

type ActionPayload =
  | {
      type: "create_transaction";
      data: {
        type?: "expense" | "income";
        amount?: number;
        category?: string;
        note?: string | null;
        occurred_on?: string;
      };
    }
  | {
      type: "create_goal";
      data: {
        title?: string;
        target_amount?: number;
        target_date?: string;
        saved_amount?: number;
      };
    }
  | {
      type: "propose_budgets";
      data: {
        month?: string;
        items?: { category: string; limit: number }[];
      };
    }
  | {
      type: "update_transaction";
      data: {
        match?: { note?: string; date?: string; category?: string };
        updates?: { category?: string; note?: string | null; amount?: number };
      };
    }
  | {
      type: "list_transactions";
      data: { month?: string; category?: string; type?: "expense" | "income" };
    };

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function monthKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function monthRange(key: string) {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

function isValidISODate(value?: string) {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inferMonthFromText(text: string): string | null {
  const t = text.toLowerCase();
  const now = new Date();
  const thisKey = monthKey(now);
  if (/\bthis month\b/.test(t)) return thisKey;
  if (/\blast month\b/.test(t)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return monthKey(d);
  }

  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const match = t.match(new RegExp(`\\b(${months.join("|")})(?:\\s+(20\\d{2}))?\\b`, "i"));
  if (!match) return null;
  const monthName = match[1];
  const year = match[2] ? Number(match[2]) : now.getFullYear();
  const monthIndex = months.indexOf(monthName.toLowerCase());
  if (monthIndex < 0) return null;
  return monthKey(new Date(year, monthIndex, 1));
}

function readIncomePrefs(): { incomeAccounts: string[]; incomeSources: string[] } {
  if (typeof window === "undefined") {
    return { incomeAccounts: ["Debit Card 1", "Debit Card 2"], incomeSources: ["Paycheck", "Transfer", "Refund", "Cash", "Other"] };
  }
  try {
    const raw = window.localStorage.getItem("prefs");
    if (!raw) return { incomeAccounts: ["Debit Card 1", "Debit Card 2"], incomeSources: ["Paycheck", "Transfer", "Refund", "Cash", "Other"] };
    const parsed = JSON.parse(raw) as Partial<{ incomeAccounts: string[]; incomeSources: string[] }>;
    const incomeAccounts = parsed.incomeAccounts?.filter(Boolean) ?? ["Debit Card 1", "Debit Card 2"];
    const incomeSources = parsed.incomeSources?.filter(Boolean) ?? ["Paycheck", "Transfer", "Refund", "Cash", "Other"];
    return { incomeAccounts, incomeSources };
  } catch {
    return { incomeAccounts: ["Debit Card 1", "Debit Card 2"], incomeSources: ["Paycheck", "Transfer", "Refund", "Cash", "Other"] };
  }
}

const QUICK_PROMPTS = [
  "Where did I spend the most this month?",
  "Give me 3 ways to cut spending next month.",
  "Do I have subscriptions I should cancel?",
  "Create a realistic grocery budget for me.",
];

const FOLLOWUP_PROMPTS = [
  "Show my top 3 categories this month.",
  "What’s my biggest recurring bill?",
  "Give me a simple budget for next month.",
  "What should I cut to save $100?",
  "Summarize my spending in one paragraph.",
  "Which day did I spend the most?",
];

function pickRandomPrompts(all: string[], count: number) {
  const copy = [...all];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
}

function pickRandomPromptsNoRepeat(all: string[], count: number, prev: string[]) {
  if (all.length <= count) return all.slice(0, count);
  const tries = 5;
  let next = pickRandomPrompts(all, count);
  let i = 0;
  while (i < tries && prev.length > 0 && next.join("|") === prev.join("|")) {
    next = pickRandomPrompts(all, count);
    i++;
  }
  return next;
}

function pickRandomPromptsExcluding(all: string[], count: number, exclude: Set<string>) {
  const pool = all.filter((p) => !exclude.has(p));
  if (pool.length >= count) return pickRandomPrompts(pool, count);
  if (pool.length > 0) return pool.slice(0, count);
  return pickRandomPrompts(all, Math.min(count, all.length));
}

const STARTER: Msg[] = [
  {
    id: uid(),
    role: "assistant",
    ts: Date.now(),
    content:
      "Hey — I’m your finance assistant.\nAsk me about spending, budgets, or subscriptions.\n\nPick a prompt below to start 👇",
  },
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500/70 [animation-delay:-0.2s]" />
      <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500/70 [animation-delay:-0.1s]" />
      <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500/70" />
    </div>
  );
}

/**
 * Tries to pull readable assistant text out of:
 * - Chat Completions: data.choices[0].message.content
 * - Responses API: data.output_text
 * - Responses API (structured): data.output[].content[] where type==="output_text"
 */
function extractAssistantText(data: any): string {
  if (!data) return "";

  const cc = data?.choices?.[0]?.message?.content;
  if (typeof cc === "string" && cc.trim()) return cc.trim();

  const ot = data?.output_text;
  if (typeof ot === "string" && ot.trim()) return ot.trim();

  const output = data?.output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const item of output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;

      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string") {
          chunks.push(c.text);
        } else if (c?.type === "text" && typeof c?.text === "string") {
          chunks.push(c.text);
        }
      }
    }
    const joined = chunks.join("\n").trim();
    if (joined) return joined;
  }

  const alt = data?.message?.content;
  if (typeof alt === "string" && alt.trim()) return alt.trim();

  return "";
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(STARTER);
  const [promptChips, setPromptChips] = useState<string[]>(() => pickRandomPrompts(QUICK_PROMPTS, 3));
  const [followupChips, setFollowupChips] = useState<string[]>([]);
  const [usedFollowups, setUsedFollowups] = useState<Set<string>>(() => new Set());
  const [contextLoading, setContextLoading] = useState(false);
  const [contextSummary, setContextSummary] = useState<{
    monthLabel: string;
    totalExpense: number;
    topCategory: string;
    topCategoryAmount: number;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionPayload | null>(null);
  const [actionMsg, setActionMsg] = useState<string>("");
  const [incomeAccounts, setIncomeAccounts] = useState<string[]>([]);
  const [incomeSources, setIncomeSources] = useState<string[]>([]);
  const [actionAccount, setActionAccount] = useState("");
  const [actionSource, setActionSource] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [actionCategory, setActionCategory] = useState("Other");
  const [actionGoalTitle, setActionGoalTitle] = useState("");
  const [actionGoalTarget, setActionGoalTarget] = useState("");
  const [actionGoalDate, setActionGoalDate] = useState("");
  const [actionGoalSaved, setActionGoalSaved] = useState("");
  const [matchedTx, setMatchedTx] = useState<{ id: string; note: string | null; occurred_on: string; amount: number; category: string } | null>(null);
  const [matchMsg, setMatchMsg] = useState<string>("");
  const [matchedTxs, setMatchedTxs] = useState<
    { id: string; note: string | null; occurred_on: string; amount: number; category: string; type: string }[]
  >([]);
  const [updateCategory, setUpdateCategory] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [updateAmount, setUpdateAmount] = useState("");
  const [listTxs, setListTxs] = useState<
    { id: string; note: string | null; occurred_on: string; amount: number; category: string; type: string }[]
  >([]);
  const [listMsg, setListMsg] = useState<string>("");
  const [listMeta, setListMeta] = useState<{ monthLabel: string; category?: string; type?: string } | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const close = () => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 180);
  };

  // Open from anywhere via: window.dispatchEvent(new Event("ai:open"))
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("ai:open", handler);
    return () => window.removeEventListener("ai:open", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPromptChips((prev) => pickRandomPromptsNoRepeat(QUICK_PROMPTS, 3, prev));
  }, [open]);

  useEffect(() => {
    if (pendingAction?.type !== "update_transaction") return;
    const run = async () => {
      setMatchMsg("");
      setMatchedTx(null);
      setMatchedTxs([]);
      const note = pendingAction.data?.match?.note?.trim();
      const date = pendingAction.data?.match?.date?.trim();
      const needPick = !note || !isValidISODate(date);

      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) {
        setMatchMsg("Not logged in.");
        return;
      }

      if (needPick) {
        const targetDate = isValidISODate(date) ? date : todayISO();
        const { data: rows, error } = await supabase
          .from("transactions")
          .select("id,note,occurred_on,amount,category,type")
          .eq("user_id", userId)
          .eq("occurred_on", targetDate)
          .order("created_at", { ascending: false });

        if (error) {
          setMatchMsg(error.message);
          return;
        }
        setMatchedTxs((rows ?? []) as any);
        setMatchMsg(
          rows && rows.length
            ? "Select a transaction to update."
            : "No transactions found for today. Try another date."
        );
        return;
      }

      let matchQuery = supabase
        .from("transactions")
        .select("id,note,occurred_on,amount,category,created_at")
        .eq("user_id", userId)
        .eq("occurred_on", date)
        .ilike("note", `%${note}%`);

      if (pendingAction.data?.match?.category?.trim()) {
        matchQuery = matchQuery.eq("category", pendingAction.data.match.category.trim());
      }

      const { data: rows, error } = await matchQuery
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        setMatchMsg(error.message);
        return;
      }
      const row = (rows ?? [])[0];
      if (!row) {
        setMatchMsg("No matching transaction found for that note and date.");
        return;
      }
      setMatchedTx({
        id: row.id,
        note: row.note ?? null,
        occurred_on: row.occurred_on,
        amount: Number(row.amount),
        category: row.category,
      });
      setUpdateCategory(pendingAction.data?.updates?.category ?? "");
      setUpdateNote(pendingAction.data?.updates?.note ?? "");
      setUpdateAmount(
        Number.isFinite(pendingAction.data?.updates?.amount)
          ? String(pendingAction.data?.updates?.amount)
          : ""
      );
    };
    run();
  }, [pendingAction]);

  useEffect(() => {
    if (pendingAction?.type !== "list_transactions") return;
    const run = async () => {
      setListMsg("");
      setListTxs([]);

      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) {
        setListMsg("Not logged in.");
        return;
      }

      const lastUserText =
        [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const rawMonth = pendingAction.data?.month;
      const inferredMonth =
        (rawMonth && !/^\d{4}-\d{2}$/.test(rawMonth) ? inferMonthFromText(rawMonth) : null) ||
        inferMonthFromText(lastUserText);
      const month = (rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : null) || inferredMonth || monthKey(new Date());
      const { start, end } = monthRange(month);

      let query = supabase
        .from("transactions")
        .select("id,note,occurred_on,amount,category,type")
        .eq("user_id", userId)
        .gte("occurred_on", start)
        .lt("occurred_on", end)
        .order("occurred_on", { ascending: false });

      if (pendingAction.data?.type) {
        query = query.eq("type", pendingAction.data.type);
      }
      if (pendingAction.data?.category) {
        query = query.eq("category", pendingAction.data.category);
      }

      const { data: rows, error } = await query;
      if (error) {
        setListMsg(error.message);
        return;
      }

      const list = (rows ?? []) as {
        id: string;
        note: string | null;
        occurred_on: string;
        amount: number;
        category: string;
        type: string;
      }[];

      setListMeta({
        monthLabel: monthLabel(month),
        category: pendingAction.data?.category,
        type: pendingAction.data?.type,
      });
      setListTxs(list);
      if (!list.length) {
        setListMsg("No matching transactions found for that month.");
      }
    };
    run();
  }, [pendingAction, messages]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setContextLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setContextSummary(null);
          return;
        }
        const key = monthKey(new Date());
        const { start, end } = monthRange(key);
        const { data: txs, error } = await supabase
          .from("transactions")
          .select("amount,type,category,occurred_on")
          .gte("occurred_on", start)
          .lt("occurred_on", end);
        if (error) {
          setContextSummary(null);
          return;
        }
        const rows = (txs ?? []) as { amount: number; type: string; category: string }[];
        const expenses = rows.filter((t) => t.type === "expense");
        const totalExpense = expenses.reduce((s, t) => s + Number(t.amount), 0);
        const catMap = new Map<string, number>();
        for (const t of expenses) {
          catMap.set(t.category, (catMap.get(t.category) ?? 0) + Number(t.amount));
        }
        let topCategory = "—";
        let topCategoryAmount = 0;
        for (const [k, v] of catMap.entries()) {
          if (v > topCategoryAmount) {
            topCategoryAmount = v;
            topCategory = k;
          }
        }
        setContextSummary({
          monthLabel: monthLabel(key),
          totalExpense,
          topCategory,
          topCategoryAmount,
        });
      } finally {
        setContextLoading(false);
      }
    };
    load();
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => textareaRef.current?.focus(), 60);
  }, [open]);

  // Auto-scroll
  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  const canSend = useMemo(() => text.trim().length > 0 && !sending, [text, sending]);

  const newChat = () => {
    if (sending) return;
    setMessages(STARTER);
    setText("");
    setPromptChips((prev) => pickRandomPromptsNoRepeat(QUICK_PROMPTS, 3, prev));
    setFollowupChips([]);
    setUsedFollowups(new Set());
    setPendingAction(null);
    setActionMsg("");
    setActionNote("");
    setActionGoalTitle("");
    setActionGoalTarget("");
    setActionGoalDate("");
    setActionGoalSaved("");
    setListTxs([]);
    setListMsg("");
    setListMeta(null);
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // Show prompt chips only when user hasn't said anything yet
  const showPromptChips = useMemo(() => {
    const anyUser = messages.some((m) => m.role === "user");
    return !anyUser && !sending;
  }, [messages, sending]);

  async function getAccessToken(): Promise<string> {
    // Ensures we try to refresh if needed
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token || "";
  }

  const send = async (override?: string) => {
    const value = (override ?? text).trim();
    if (!value || sending) return;

    setSending(true);

    const userMsg: Msg = { id: uid(), role: "user", content: value, ts: Date.now() };
    const typingId = uid();

    // Optimistic UI: add user msg + typing placeholder
    setMessages((m) => [
      ...m,
      userMsg,
      { id: typingId, role: "assistant", content: "", ts: Date.now(), typing: true },
    ]);
    setText("");

    try {
      // Require login (or show a clean message)
      const token = await getAccessToken();
      if (!token) {
        throw new Error("You’re not logged in. Please sign in to use the AI assistant.");
      }

      // Build history to send (exclude typing placeholders)
      const history = [...messages, userMsg]
        .filter((m) => !m.typing)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // ✅ THIS FIXES YOUR ERROR
        },
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error?.message || data?.message || `AI request failed (${res.status})`;
        throw new Error(msg);
      }

      const rawAnswer = extractAssistantText(data);
      if (!rawAnswer) {
        throw new Error(
          "I got a response, but it didn’t include readable text. (Check your API response shape.)"
        );
      }

      let finalAnswer = rawAnswer;
      let modelSuggestions: string[] | null = null;
      let modelAction: ActionPayload | null = null;
      try {
        const parsed = JSON.parse(rawAnswer);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.answer === "string") finalAnswer = parsed.answer;
          if (Array.isArray(parsed.suggestions)) {
            modelSuggestions = parsed.suggestions.filter((s: any) => typeof s === "string").slice(0, 3);
          }
          if (parsed.action && typeof parsed.action === "object") {
            modelAction = parsed.action as ActionPayload;
          }
        }
      } catch {
        const start = rawAnswer.indexOf("{");
        const end = rawAnswer.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try {
            const parsed = JSON.parse(rawAnswer.slice(start, end + 1));
            if (parsed && typeof parsed === "object") {
              if (typeof parsed.answer === "string") finalAnswer = parsed.answer;
              if (Array.isArray(parsed.suggestions)) {
                modelSuggestions = parsed.suggestions.filter((s: any) => typeof s === "string").slice(0, 3);
              }
              if (parsed.action && typeof parsed.action === "object") {
                modelAction = parsed.action as ActionPayload;
              }
            }
          } catch {
            // ignore parse errors; fallback to rawAnswer
          }
        }
      }

      // Fallback: if model didn't return an action but user asked to list or update transactions, infer it.
      if (!modelAction) {
        const textLower = userMsg.content.toLowerCase();
        const wantsUpdate = /\b(update|edit|change)\b/.test(textLower) && /\b(transaction|expense|income)\b/.test(textLower);
        const wantsList =
          /\b(list|show|see|display|all)\b/.test(textLower) &&
          /\b(transactions?|expenses?|income)\b/.test(textLower);
        if (wantsUpdate) {
          const date = /today/.test(textLower) ? todayISO() : undefined;
          modelAction = {
            type: "update_transaction",
            data: {
              match: { date },
              updates: {},
            },
          };
        } else if (wantsList) {
          const month = inferMonthFromText(userMsg.content) || monthKey(new Date());
          const type =
            /\bincome\b/.test(textLower) ? "income" : /\bexpense(s)?\b/.test(textLower) ? "expense" : undefined;
          const category =
            CATEGORIES.find((c) => textLower.includes(c.name.toLowerCase()))?.name || undefined;
          modelAction = {
            type: "list_transactions",
            data: { month, type: type as any, category },
          };
        }
      }

      setMessages((m) =>
        m.map((x) => (x.id === typingId ? { ...x, typing: false, content: finalAnswer } : x))
      );

      if (modelSuggestions && modelSuggestions.length) {
        setFollowupChips(modelSuggestions);
      } else {
        setFollowupChips((prev) => {
          const lastUser = userMsg.content.trim();
          const exclude = new Set<string>([...usedFollowups, lastUser, ...prev]);
          const next = pickRandomPromptsExcluding(FOLLOWUP_PROMPTS, 3, exclude);
          setUsedFollowups((u) => {
            const nu = new Set(u);
            next.forEach((p) => nu.add(p));
            return nu;
          });
          return next;
        });
      }
      if (modelAction?.type === "create_transaction") {
        const prefs = readIncomePrefs();
        setIncomeAccounts(prefs.incomeAccounts);
        setIncomeSources(prefs.incomeSources);
        setActionAccount(prefs.incomeAccounts[0] ?? "");
        setActionSource(prefs.incomeSources[0] ?? "");
        setActionNote(modelAction.data?.note ?? "");
        setActionCategory(modelAction.data?.category ?? "Other");
      }
      if (modelAction?.type === "create_goal") {
        setActionGoalTitle(modelAction.data?.title ?? "");
        setActionGoalTarget(
          modelAction.data?.target_amount ? String(modelAction.data.target_amount) : ""
        );
        setActionGoalDate(modelAction.data?.target_date ?? "");
        setActionGoalSaved(
          modelAction.data?.saved_amount ? String(modelAction.data.saved_amount) : ""
        );
      }
      setPendingAction(modelAction);
    } catch (e: any) {
      setMessages((m) =>
        m.map((x) =>
          x.id === typingId
            ? {
                ...x,
                typing: false,
                content:
                  `⚠️ ${e?.message || "AI request failed"}\n\n` +
                  "(If this keeps happening, check your /api/ai route + env vars.)",
              }
            : x
        )
      );
      setFollowupChips((prev) => {
        const lastUser = userMsg.content.trim();
        const exclude = new Set<string>([...usedFollowups, lastUser, ...prev]);
        const next = pickRandomPromptsExcluding(FOLLOWUP_PROMPTS, 3, exclude);
        setUsedFollowups((u) => {
          const nu = new Set(u);
          next.forEach((p) => nu.add(p));
          return nu;
        });
        return next;
      });
    } finally {
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 40);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(true)}
        className={[
          "fixed z-40",
          "left-5 right-auto bottom-[calc(4.5rem+env(safe-area-inset-bottom))]",
          "md:left-auto md:right-5 md:bottom-5",
          "rounded-full px-4 py-2 text-xs font-semibold",
          "sm:px-5 sm:py-3 sm:text-sm",
          "text-black shadow-[0_12px_30px_-18px_rgba(16,185,129,0.8)]",
          "bg-gradient-to-r from-emerald-400 via-emerald-500 to-cyan-400",
          "hover:opacity-90 active:scale-[0.99]",
        ].join(" ")}
      >
        ✨ AI
      </button>

      {open && (
        <div
          className={[
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
            closing ? "animate-[fadeOut_180ms_ease-in]" : "animate-[fadeIn_160ms_ease-out]",
          ].join(" ")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          {/* Panel */}
          <div
            className={[
              "fixed right-0 top-0 h-full w-full max-w-[440px] flex flex-col",
              "border-l border-zinc-200 bg-white shadow-2xl",
              "dark:border-white/10 dark:bg-zinc-950",
              closing
                ? "animate-[panelOut_180ms_ease-in]"
                : "animate-[panelIn_220ms_cubic-bezier(0.2,0.8,0.2,1)]",
            ].join(" ")}
          >
            {/* Header */}
            <div className="border-b border-zinc-200 px-4 py-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-black flex items-center justify-center font-extrabold">
                    AI
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate text-zinc-900 dark:text-zinc-50">
                      Finance Assistant
                    </p>
                    <p className="text-xs opacity-60 leading-tight truncate text-zinc-600 dark:text-zinc-300">
                      Private insights • Uses summaries only
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={newChat}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:hover:bg-white/10"
                    title="New chat"
                  >
                    New
                  </button>
                  <button
                    onClick={close}
                    className="rounded-xl px-2 py-1 text-lg text-zinc-900 hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-white/10"
                    aria-label="Close"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {contextLoading && (
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                    Loading context…
                  </span>
                )}
                {!contextLoading && contextSummary && (
                  <>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                      {contextSummary.monthLabel}
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                      Spend {money(contextSummary.totalExpense)}
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                      Top: {contextSummary.topCategory} {money(contextSummary.topCategoryAmount)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Messages */}
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                const isFirstAssistant = idx === 0 && m.role === "assistant";

                return (
                  <div key={m.id} className="space-y-2">
                    <div className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                      {!isUser && (
                        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-black flex items-center justify-center text-xs font-extrabold">
                          AI
                        </div>
                      )}

                      <div
                        className={[
                          "max-w-[82%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm",
                          isUser
                            ? "bg-emerald-600 text-white"
                            : "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-zinc-50",
                        ].join(" ")}
                      >
                        {m.typing ? <TypingDots /> : <span className="whitespace-pre-line">{m.content}</span>}
                      </div>

                      {isUser && (
                        <div className="h-8 w-8 rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-center dark:border-white/10 dark:bg-white/5">
                          👤
                        </div>
                      )}
                    </div>

                    {isFirstAssistant && showPromptChips && (
                      <div className="ml-10 flex flex-wrap gap-2">
                        {promptChips.map((p) => (
                          <button
                            key={p}
                            onClick={() => send(p)}
                            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:hover:bg-white/10"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {!sending &&
                messages.length > 0 &&
                messages[messages.length - 1].role === "assistant" &&
                !messages[messages.length - 1].typing &&
                followupChips.length > 0 && (
                  <div className="ml-10 flex flex-wrap gap-2 pt-1">
                    {followupChips.map((p) => (
                      <button
                        key={p}
                        onClick={() => send(p)}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:hover:bg-white/10"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}

              {pendingAction?.type === "create_transaction" && (
                <div className="ml-10 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  <p className="font-semibold">Add this transaction?</p>
                  <p className="mt-1 opacity-90">
                    {money(pendingAction.data?.amount ?? 0)}{" "}
                    {pendingAction.data?.type === "income" ? "income" : "expense"} •{" "}
                    {(pendingAction.data?.note || actionNote || "Note")} •{" "}
                    {(pendingAction.data?.category || actionCategory || "Other")} •{" "}
                    {formatDateMDY(pendingAction.data?.occurred_on || todayISO())}
                  </p>

                  {pendingAction.data?.type === "income" ? (
                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/70">Account</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {incomeAccounts.map((a) => (
                            <button
                              key={a}
                              onClick={() => setActionAccount(a)}
                              className={[
                                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                                a === actionAccount
                                  ? "border-emerald-200 bg-emerald-500 text-black"
                                  : "border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/10",
                              ].join(" ")}
                            >
                              {a}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/70">Source</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {incomeSources.map((s) => (
                            <button
                              key={s}
                              onClick={() => setActionSource(s)}
                              className={[
                                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                                s === actionSource
                                  ? "border-emerald-200 bg-emerald-500 text-black"
                                  : "border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/10",
                              ].join(" ")}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/70">Category</p>
                        <select
                          value={actionCategory}
                          onChange={(e) => setActionCategory(e.target.value)}
                          className="mt-2 w-full rounded-2xl border border-emerald-500/40 bg-black/30 px-3 py-2 text-xs text-emerald-100 outline-none"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.icon} {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/70">Note</p>
                        <input
                          value={actionNote}
                          onChange={(e) => setActionNote(e.target.value)}
                          placeholder="Add a note (optional)"
                          className="mt-2 w-full rounded-2xl border border-emerald-500/40 bg-black/30 px-3 py-2 text-xs text-emerald-100 placeholder:text-emerald-100/60 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={async () => {
                        setActionMsg("");
                        const amt = Number(pendingAction.data?.amount ?? 0);
                        if (!amt || Number.isNaN(amt)) {
                          setActionMsg("Invalid amount.");
                          return;
                        }
                        const type = pendingAction.data?.type === "income" ? "income" : "expense";
                        const category = (pendingAction.data?.category?.trim() || actionCategory || "Other").trim();
                        let note: string | null = (pendingAction.data?.note?.trim() || actionNote || "").trim();
                        const occurred_on = isValidISODate(pendingAction.data?.occurred_on)
                          ? (pendingAction.data?.occurred_on as string)
                          : todayISO();

                        const lock = assertDateIsInCurrentMonth(occurred_on);
                        if (!lock.ok) {
                          setActionMsg(lock.message);
                          return;
                        }

                        if (type === "income") {
                          const parts = [
                            actionAccount ? `Account: ${actionAccount}` : "",
                            actionSource ? `Source: ${actionSource}` : "",
                            note,
                          ].filter(Boolean);
                          note = parts.join(" • ");
                        }
                        if (!note) note = null;

                        const { data } = await supabase.auth.getSession();
                        const userId = data.session?.user.id;
                        if (!userId) {
                          setActionMsg("Not logged in.");
                          return;
                        }

                        let recurringIds: { subscription_id?: string; recurring_bill_id?: string } = {};
                        if (type === "expense") {
                          recurringIds = await matchRecurringForTransaction({
                            userId,
                            occurredOn: occurred_on,
                            note: note ?? "",
                            amount: amt,
                            category,
                          });
                        }

                        const { error } = await supabase.from("transactions").insert({
                          user_id: userId,
                          type,
                          amount: amt,
                          category,
                          note,
                          occurred_on,
                          ...recurringIds,
                        });
                        if (error) {
                          setActionMsg(error.message);
                          return;
                        }
                        window.dispatchEvent(new Event("tx:changed"));
                        setPendingAction(null);
                        setActionMsg("Added.");
                      }}
                      className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setPendingAction(null)}
                      className="rounded-full border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/10"
                    >
                      Cancel
                    </button>
                  </div>
                  {actionMsg && <p className="mt-2 text-xs text-emerald-100/80">{actionMsg}</p>}
                </div>
              )}

              {pendingAction?.type === "create_goal" && (
                <div className="ml-10 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  <p className="font-semibold">Create this goal?</p>
                  <p className="mt-1 opacity-90">
                    {actionGoalTitle || pendingAction.data?.title || "Goal"} •{" "}
                    {money(Number(actionGoalTarget || pendingAction.data?.target_amount || 0))}
                    {actionGoalDate || pendingAction.data?.target_date
                      ? ` • ${formatDateMDY(actionGoalDate || pendingAction.data?.target_date || "")}`
                      : ""}
                  </p>

                  <div className="mt-3 grid gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/70">Goal</p>
                      <input
                        value={actionGoalTitle}
                        onChange={(e) => setActionGoalTitle(e.target.value)}
                        placeholder="Goal name"
                        className="mt-2 w-full rounded-2xl border border-emerald-500/40 bg-black/30 px-3 py-2 text-xs text-emerald-100 placeholder:text-emerald-100/60 outline-none"
                      />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/70">Target amount</p>
                      <input
                        value={actionGoalTarget}
                        onChange={(e) => setActionGoalTarget(e.target.value)}
                        placeholder="500"
                        inputMode="decimal"
                        className="mt-2 w-full rounded-2xl border border-emerald-500/40 bg-black/30 px-3 py-2 text-xs text-emerald-100 placeholder:text-emerald-100/60 outline-none"
                      />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/70">Target date</p>
                      <input
                        value={actionGoalDate}
                        onChange={(e) => setActionGoalDate(e.target.value)}
                        placeholder="YYYY-MM-DD"
                        className="mt-2 w-full rounded-2xl border border-emerald-500/40 bg-black/30 px-3 py-2 text-xs text-emerald-100 placeholder:text-emerald-100/60 outline-none"
                      />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/70">Starting saved</p>
                      <input
                        value={actionGoalSaved}
                        onChange={(e) => setActionGoalSaved(e.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                        className="mt-2 w-full rounded-2xl border border-emerald-500/40 bg-black/30 px-3 py-2 text-xs text-emerald-100 placeholder:text-emerald-100/60 outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={async () => {
                        setActionMsg("");
                        const title = actionGoalTitle.trim();
                        const target = Number(actionGoalTarget);
                        const saved = Number(actionGoalSaved || 0);
                        const date = actionGoalDate.trim();
                        if (!title) {
                          setActionMsg("Please enter a goal name.");
                          return;
                        }
                        if (!Number.isFinite(target) || target <= 0) {
                          setActionMsg("Target amount must be a positive number.");
                          return;
                        }
                        if (date && !/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {
                          setActionMsg("Target date must be YYYY-MM-DD.");
                          return;
                        }

                        const { data } = await supabase.auth.getSession();
                        const userId = data.session?.user.id;
                        if (!userId) {
                          setActionMsg("Not logged in.");
                          return;
                        }

                        const { error } = await supabase.from("goals").insert({
                          user_id: userId,
                          title,
                          target_amount: target,
                          saved_amount: Number.isFinite(saved) ? saved : 0,
                          target_date: date || null,
                          status: "active",
                        });

                        if (error) {
                          setActionMsg(error.message);
                          return;
                        }

                        window.dispatchEvent(new Event("goals:changed"));
                        setPendingAction(null);
                        setActionMsg("Goal added.");
                      }}
                      className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"
                    >
                      Add goal
                    </button>
                    <button
                      onClick={() => setPendingAction(null)}
                      className="rounded-full border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/10"
                    >
                      Cancel
                    </button>
                  </div>
                  {actionMsg && <p className="mt-2 text-xs text-emerald-100/80">{actionMsg}</p>}
                </div>
              )}

              {pendingAction?.type === "list_transactions" && (
                <div className="ml-10 rounded-2xl border border-slate-500/30 bg-white/10 p-3 text-sm text-zinc-100">
                  <p className="font-semibold">Transactions list</p>
                  {listMeta && (
                    <p className="mt-1 text-xs opacity-80">
                      {listMeta.monthLabel}
                      {listMeta.category ? ` • ${listMeta.category}` : ""}
                      {listMeta.type ? ` • ${listMeta.type}` : ""}
                    </p>
                  )}
                  {listMsg && <p className="mt-2 opacity-90">{listMsg}</p>}
                  {!listMsg && (
                    <div className="mt-2 space-y-2">
                      {listTxs.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate">
                              {t.category} • {t.note || "No note"}
                            </p>
                            <p className="text-xs opacity-70">
                              {formatDateMDY(t.occurred_on)} • {t.type}
                            </p>
                          </div>
                          <div className="text-sm font-semibold">{money(Number(t.amount))}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {pendingAction?.type === "propose_budgets" && (
                <div className="ml-10 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                  <p className="font-semibold">Proposed budgets</p>
                  <div className="mt-2 space-y-1">
                    {(pendingAction.data?.items ?? []).map((it) => (
                      <div key={it.category} className="flex items-center justify-between gap-3">
                        <span>{it.category}</span>
                        <span className="font-semibold">{money(it.limit)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={async () => {
                        const items = (pendingAction.data?.items ?? []).filter(
                          (i) => i.category && Number.isFinite(i.limit) && i.limit > 0
                        );
                        if (!items.length) return;

                        const { data } = await supabase.auth.getSession();
                        const userId = data.session?.user.id;
                        if (!userId) return;

                        const { data: existing, error } = await supabase
                          .from("budgets")
                          .select("id,category")
                          .eq("user_id", userId);
                        if (error) return;

                        const existingMap = new Map((existing ?? []).map((b: any) => [b.category, b.id]));

                        for (const item of items) {
                          const id = existingMap.get(item.category);
                          if (id) {
                            await supabase.from("budgets").update({ monthly_limit: item.limit }).eq("id", id);
                          } else {
                            await supabase.from("budgets").insert({
                              user_id: userId,
                              category: item.category,
                              monthly_limit: item.limit,
                            });
                          }
                        }

                        window.dispatchEvent(new Event("tx:changed"));
                        setPendingAction(null);
                      }}
                      className="rounded-full bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"
                    >
                      Apply budgets
                    </button>
                    <button
                      onClick={() => setPendingAction(null)}
                      className="rounded-full border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/10"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {pendingAction?.type === "update_transaction" && (
                <div className="ml-10 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <p className="font-semibold">Update transaction?</p>
                  {matchMsg && <p className="mt-1 opacity-90">{matchMsg}</p>}
                  {matchedTxs.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {matchedTxs.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setMatchedTx({
                              id: t.id,
                              note: t.note ?? null,
                              occurred_on: t.occurred_on,
                              amount: Number(t.amount),
                              category: t.category,
                            });
                            setUpdateCategory(t.category ?? "");
                            setUpdateNote(t.note ?? "");
                            setUpdateAmount(String(t.amount ?? ""));
                          }}
                          className={[
                            "w-full text-left rounded-xl border px-3 py-2 transition",
                            matchedTx?.id === t.id
                              ? "border-amber-200 bg-amber-500/20"
                              : "border-white/10 bg-black/20 hover:bg-white/10",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate">
                                {t.category} • {t.note || "No note"}
                              </p>
                              <p className="text-xs opacity-70">
                                {formatDateMDY(t.occurred_on)} • {t.type}
                              </p>
                            </div>
                            <div className="text-sm font-semibold">{money(Number(t.amount))}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {matchedTx && (
                    <>
                      <p className="mt-1 opacity-90">
                        {money(matchedTx.amount)} • {matchedTx.note || "Note"} • {matchedTx.category} •{" "}
                        {formatDateMDY(matchedTx.occurred_on)}
                      </p>
                      <div className="mt-3 grid gap-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.12em] text-amber-100/70">Category</p>
                          <select
                            value={updateCategory}
                            onChange={(e) => setUpdateCategory(e.target.value)}
                            className="mt-2 w-full rounded-2xl border border-amber-500/40 bg-black/30 px-3 py-2 text-xs text-amber-100 outline-none"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.icon} {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.12em] text-amber-100/70">Note</p>
                          <input
                            value={updateNote}
                            onChange={(e) => setUpdateNote(e.target.value)}
                            placeholder="Update note (optional)"
                            className="mt-2 w-full rounded-2xl border border-amber-500/40 bg-black/30 px-3 py-2 text-xs text-amber-100 placeholder:text-amber-100/60 outline-none"
                          />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.12em] text-amber-100/70">Amount</p>
                          <input
                            value={updateAmount}
                            onChange={(e) => setUpdateAmount(e.target.value)}
                            placeholder="Update amount (optional)"
                            inputMode="decimal"
                            className="mt-2 w-full rounded-2xl border border-amber-500/40 bg-black/30 px-3 py-2 text-xs text-amber-100 placeholder:text-amber-100/60 outline-none"
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          onClick={async () => {
                            if (!matchedTx) return;
                            const updates: Record<string, any> = {};
                            if (updateCategory && updateCategory !== matchedTx.category) {
                              updates.category = updateCategory;
                            }
                            const cleanNote = updateNote.trim();
                            if (cleanNote !== (matchedTx.note ?? "")) {
                              updates.note = cleanNote || null;
                            }
                            const amt = Number(updateAmount);
                            if (updateAmount && Number.isFinite(amt) && amt !== matchedTx.amount) {
                              updates.amount = amt;
                            }
                            if (!Object.keys(updates).length) {
                              setMatchMsg("No changes to apply.");
                              return;
                            }
                            const { error } = await supabase
                              .from("transactions")
                              .update(updates)
                              .eq("id", matchedTx.id);
                            if (!error) {
                              window.dispatchEvent(new Event("tx:changed"));
                              setPendingAction(null);
                              setMatchedTx(null);
                              setMatchedTxs([]);
                            } else {
                              setMatchMsg(error.message);
                            }
                          }}
                          className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"
                        >
                          Apply change
                        </button>
                        <button
                          onClick={() => {
                            setPendingAction(null);
                            setMatchedTx(null);
                          }}
                          className="rounded-full border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/10"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>

            {/* Input */}
            <div className="border-t border-zinc-200 p-4 dark:border-white/10">
              <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-white/5">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Message Finance Copilot…"
                  rows={1}
                  className={[
                    "w-full resize-none bg-transparent px-2 py-2 text-sm outline-none",
                    "text-zinc-900 dark:text-zinc-50",
                    "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                    "caret-emerald-600 dark:caret-emerald-400",
                  ].join(" ")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />

                <div className="mt-2 flex items-center justify-between gap-2 px-2 pb-1">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Enter to send • Shift+Enter for new line
                  </p>

                  <button
                    onClick={() => send()}
                    disabled={!canSend}
                    className={[
                      "rounded-xl px-4 py-2 text-sm font-semibold transition",
                      canSend
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : "bg-zinc-200 text-zinc-500 dark:bg-white/10 dark:text-white/30",
                    ].join(" ")}
                  >
                    {sending ? "…" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Animations */}
          <style jsx global>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            @keyframes fadeOut {
              from {
                opacity: 1;
              }
              to {
                opacity: 0;
              }
            }
            @keyframes panelIn {
              from {
                transform: translateX(18px);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
            @keyframes panelOut {
              from {
                transform: translateX(0);
                opacity: 1;
              }
              to {
                transform: translateX(18px);
                opacity: 0;
              }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
