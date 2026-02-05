import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Role = "system" | "user" | "assistant";
type ChatMsg = { role: Role; content: string };

type Tx = {
  id: string;
  user_id: string;
  type: "expense" | "income";
  amount: number;
  category: string;
  note: string | null;
  occurred_on: string; // YYYY-MM-DD
  created_at: string;
};

type Budget = {
  id: string;
  user_id: string;
  category: string;
  monthly_limit: number;
  created_at: string;
};

type Goal = {
  id: string;
  user_id: string;
  title: string;
  target_amount: number;
  saved_amount: number;
  target_date: string | null;
  status: string;
  created_at: string;
};

function extractAssistantTextFromUpstream(data: any): string {
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
        if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") {
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

function normalizeAssistantJson(raw: string) {
  // If already JSON, return as-is.
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return JSON.stringify({
        answer: typeof parsed.answer === "string" ? parsed.answer : raw,
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter((s: any) => typeof s === "string").slice(0, 3)
          : [],
        action: parsed.action ?? null,
      });
    }
  } catch {
    // fall through
  }

  // Strip "Suggestions:" and "Action:" blocks from answer
  let answer = raw;
  const suggestions: string[] = [];
  const suggestionsIdx = answer.indexOf("Suggestions:");
  if (suggestionsIdx >= 0) {
    const before = answer.slice(0, suggestionsIdx).trim();
    const after = answer.slice(suggestionsIdx);
    answer = before;
    const quoted = after.match(/"([^"]+)"/g) ?? [];
    for (const q of quoted) {
      suggestions.push(q.replace(/(^")|("$)/g, ""));
      if (suggestions.length >= 3) break;
    }
  }
  const actionIdx = answer.indexOf("Action:");
  if (actionIdx >= 0) {
    answer = answer.slice(0, actionIdx).trim();
  }

  return JSON.stringify({
    answer,
    suggestions: suggestions.slice(0, 3),
    action: null,
  });
}

function monthKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function monthRange(key: string) {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function prevMonthKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return monthKey(d);
}

function normalizeNote(note: string) {
  return note
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Detect possible subscriptions:
 * Look for expense transactions where (category + normalized note + amount)
 * appears across >= 3 distinct months in last 6 months window.
 */
function detectSubscriptions(last6MonthsTx: Tx[]) {
  const groups = new Map<string, Set<string>>(); // key -> set of months
  for (const t of last6MonthsTx) {
    if (t.type !== "expense") continue;
    const note = normalizeNote(t.note ?? "");
    if (!note || note.length < 3) continue;

    const amt = round2(Number(t.amount)).toFixed(2);
    const m = (t.occurred_on ?? "").slice(0, 7);
    const key = `${t.category}::${note}::${amt}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(m);
  }

  const detected: Array<{
    category: string;
    note: string;
    amount: number;
    monthsSeen: number;
  }> = [];

  for (const [k, months] of groups.entries()) {
    if (months.size >= 3) {
      const [category, note, amt] = k.split("::");
      detected.push({
        category,
        note,
        amount: Number(amt),
        monthsSeen: months.size,
      });
    }
  }

  detected.sort((a, b) => b.monthsSeen - a.monthsSeen || b.amount - a.amount);
  return detected.slice(0, 8);
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";

    if (!token) {
      return NextResponse.json(
        { error: { message: "Missing Authorization Bearer token (Supabase session access token)." } },
        { status: 401 }
      );
    }

    const bodyIn = await req.json().catch(() => ({}));
    const incomingMessages = bodyIn?.messages as ChatMsg[] | undefined;

    if (!Array.isArray(incomingMessages) || incomingMessages.length === 0) {
      return NextResponse.json(
        { error: { message: "Missing 'messages' array in request body." } },
        { status: 400 }
      );
    }

    const requestedMonth =
      typeof bodyIn?.month === "string" && /^\d{4}-\d{2}$/.test(bodyIn.month)
        ? bodyIn.month
        : monthKey(new Date());

    // ✅ Use YOUR env var names
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: { message: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT." } },
        { status: 500 }
      );
    }

    // ✅ Use the user's JWT + anon key so RLS stays enforced
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    // Verify token -> user
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return NextResponse.json(
        { error: { message: "Invalid session token (Supabase auth.getUser failed)." } },
        { status: 401 }
      );
    }
    const userId = userData.user.id;

    // Range: this month + last month for comparisons
    const lastMonth = prevMonthKey(requestedMonth);
    const { start: startLast } = monthRange(lastMonth);
    const { end: endThis } = monthRange(requestedMonth);

    // For subscription detection: last ~6 months window
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sixStart = sixMonthsAgo.toISOString().slice(0, 10);
    const sixEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

    // Pull tx for the 2-month window
    const { data: txData, error: txErr } = await supabase
      .from("transactions")
      .select("id,user_id,type,amount,category,note,occurred_on,created_at")
      .eq("user_id", userId)
      .gte("occurred_on", startLast)
      .lt("occurred_on", endThis)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (txErr) {
      return NextResponse.json(
        { error: { message: `Supabase transactions query failed: ${txErr.message}` } },
        { status: 500 }
      );
    }

    const txs = (txData ?? []) as Tx[];
    const thisMonthTxs = txs.filter((t) => (t.occurred_on ?? "").startsWith(requestedMonth));
    const lastMonthTxs = txs.filter((t) => (t.occurred_on ?? "").startsWith(lastMonth));

    const thisIncome = sum(thisMonthTxs.filter((t) => t.type === "income").map((t) => Number(t.amount)));
    const thisExpense = sum(thisMonthTxs.filter((t) => t.type === "expense").map((t) => Number(t.amount)));
    const thisNet = thisIncome - thisExpense;

    const lastExpense = sum(lastMonthTxs.filter((t) => t.type === "expense").map((t) => Number(t.amount)));
    const expenseMoM =
      lastExpense > 0 ? round2(((thisExpense - lastExpense) / lastExpense) * 100) : null;

    // Top categories (expenses only)
    const catMap = new Map<string, number>();
    for (const t of thisMonthTxs) {
      if (t.type !== "expense") continue;
      catMap.set(t.category, (catMap.get(t.category) ?? 0) + Number(t.amount));
    }
    const topCategories = Array.from(catMap.entries())
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    // Last month category breakdown (expenses only)
    const lastCatMap = new Map<string, number>();
    for (const t of lastMonthTxs) {
      if (t.type !== "expense") continue;
      lastCatMap.set(t.category, (lastCatMap.get(t.category) ?? 0) + Number(t.amount));
    }
    const topCategoriesLastMonth = Array.from(lastCatMap.entries())
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    const { data: subsData, error: subsErr } = await supabase
      .from("subscriptions")
      .select("id,user_id,name,amount_monthly,billing_day,created_at")
      .eq("user_id", userId);

    if (subsErr) {
      return NextResponse.json(
        { error: { message: `Supabase subscriptions query failed: ${subsErr.message}` } },
        { status: 500 }
      );
    }

    const subscriptionsThisMonth = (subsData ?? [])
      .map((s: any) => ({
        id: s.id,
        name: (s.name || "Subscription").trim(),
        amountMonthly: round2(Number(s.amount_monthly)),
        amountAnnual: round2(Number(s.amount_monthly) * 12),
        billing_day: s.billing_day,
      }))
      .sort((a: any, b: any) => b.amountMonthly - a.amountMonthly);

    // Budgets (optional)
    const { data: budgetData, error: budErr } = await supabase
      .from("budgets")
      .select("id,user_id,category,monthly_limit,created_at")
      .eq("user_id", userId);

    if (budErr) {
      return NextResponse.json(
        { error: { message: `Supabase budgets query failed: ${budErr.message}` } },
        { status: 500 }
      );
    }

    const budgets = (budgetData ?? []) as Budget[];
    const budgetUsage = budgets
      .map((b) => {
        const spent = round2(catMap.get(b.category) ?? 0);
        const limit = Number(b.monthly_limit) || 0;
        const pctUsed = limit > 0 ? round2((spent / limit) * 100) : null;
        const remaining = round2(Math.max(0, limit - spent));
        const overBy = round2(Math.max(0, spent - limit));
        return {
          category: b.category,
          limit: round2(limit),
          spent,
          pctUsed,
          remaining,
          overBy,
        };
      })
      .sort((a, b) => (b.pctUsed ?? 0) - (a.pctUsed ?? 0))
      .slice(0, 10);

    const { data: goalsData, error: goalsErr } = await supabase
      .from("goals")
      .select("id,user_id,title,target_amount,saved_amount,target_date,status,created_at")
      .eq("user_id", userId);

    if (goalsErr) {
      return NextResponse.json(
        { error: { message: `Supabase goals query failed: ${goalsErr.message}` } },
        { status: 500 }
      );
    }

    const goals = (goalsData ?? []) as Goal[];

    // Subscription detection window (6 months)
    const { data: tx6Data, error: tx6Err } = await supabase
      .from("transactions")
      .select("id,user_id,type,amount,category,note,occurred_on,created_at")
      .eq("user_id", userId)
      .gte("occurred_on", sixStart)
      .lt("occurred_on", sixEnd);

    if (tx6Err) {
      return NextResponse.json(
        { error: { message: `Supabase 6mo tx query failed: ${tx6Err.message}` } },
        { status: 500 }
      );
    }

    const possibleSubscriptions = detectSubscriptions((tx6Data ?? []) as Tx[]);

    // Build context summary to feed the model
    const context = {
      month: requestedMonth,
      comparisons: {
        lastMonth,
        expenseMoMPercent: expenseMoM,
      },
      totals: {
        income: round2(thisIncome),
        expenses: round2(thisExpense),
        net: round2(thisNet),
      },
      topCategories,
      topCategoriesLastMonth,
      budgetUsage,
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        target_amount: round2(Number(g.target_amount)),
        saved_amount: round2(Number(g.saved_amount)),
        target_date: g.target_date,
        status: g.status,
      })),

      // ✅ NEW: explicit subscription list for the selected month
      subscriptionsThisMonth, // [{ name, amountMonthly, amountAnnual }]

      // Still useful: “recurring across months” detector
      possibleSubscriptions,

      notes: [
        "All values are derived from this user's transaction data.",
        "For subscription questions, use subscriptionsThisMonth (from the subscriptions table).",
        "possibleSubscriptions requires >= 3 distinct months of repeats from transactions.",
      ],
    };

    // -------------------- Azure Foundry upstream call --------------------
    const url = process.env.AZURE_FOUNDRY_RESPONSES_URL;
    const apiKey = process.env.AZURE_FOUNDRY_API_KEY;

    if (!url || !apiKey) {
      return NextResponse.json(
        { error: { message: "Missing AZURE_FOUNDRY_API_KEY or AZURE_FOUNDRY_RESPONSES_URL." } },
        { status: 500 }
      );
    }

    const systemMsg: ChatMsg = {
      role: "system",
      content:
        "You are a helpful AI financial assistant inside a budgeting app.\n" +
        "Use ONLY the provided JSON context to answer.\n" +
        "Do not invent numbers. If a detail is missing, ask a short follow-up.\n" +
        "If the user asks about subscriptions, list each item in subscriptionsThisMonth with monthly + annual.\n" +
        "Return concise, actionable advice.\n" +
        "You have both topCategories (this month) and topCategoriesLastMonth (last month) for comparisons.\n" +
        "ALWAYS respond as a JSON object with keys: answer (string), suggestions (array of 3 short follow-up prompts), and action (object or null).\n" +
        "If the user asks to add a transaction (e.g., \"Spent $18 on Starbucks today\"), set action to:\n" +
        "{\"type\":\"create_transaction\",\"data\":{\"type\":\"expense\",\"amount\":18,\"category\":\"Other\",\"note\":null,\"occurred_on\":\"YYYY-MM-DD\"}}\n" +
        "Do NOT invent notes or sources. If missing, leave note null and let the UI ask.\n" +
        "If the user asks for a budget proposal (e.g., \"Make a budget for next month\"), set action to:\n" +
        "{\"type\":\"propose_budgets\",\"data\":{\"month\":\"YYYY-MM\",\"items\":[{\"category\":\"Groceries\",\"limit\":200},{\"category\":\"Dining\",\"limit\":120}]}}\n" +
        "If the user wants to create a goal (e.g., \"Save $500 by June\"), set action to:\n" +
        "{\"type\":\"create_goal\",\"data\":{\"title\":\"Save $500\",\"target_amount\":500,\"target_date\":\"YYYY-MM-DD\",\"saved_amount\":0}}\n" +
        "If the user asks to change a transaction (e.g., \"Change category for Marcos Tacos on 2026-02-02 to Dining\"), set action to:\n" +
        "{\"type\":\"update_transaction\",\"data\":{\"match\":{\"note\":\"Marcos Tacos\",\"date\":\"YYYY-MM-DD\",\"category\":\"Dining\"},\"updates\":{\"category\":\"Dining\"}}}\n" +
        "If the user asks to list or show transactions/expenses (e.g., \"Show all Dining transactions\", \"List all expenses for last month\"), set action to:\n" +
        "{\"type\":\"list_transactions\",\"data\":{\"month\":\"YYYY-MM\",\"category\":\"Dining\",\"type\":\"expense\"}}\n" +
        "If the user says expenses, set type to \"expense\". If they say income, set type to \"income\".\n" +
        "If the user says \"this month\", use month = context.month.\n" +
        "If the user says \"last month\", use comparisons.lastMonth for the month field.\n" +
        "Otherwise, set action to null.\n" +
        "IMPORTANT: Return ONLY the JSON. Do NOT include the words 'Suggestions:' or 'Action:' and do NOT include any other text outside the JSON.\n" +
        "Example: {\"answer\":\"...\",\"suggestions\":[\"...\",\"...\",\"...\"],\"action\":null}\n\n" +
        "CONTEXT(JSON):\n" +
        JSON.stringify(context),
    };

    const upstreamPayload = {
      messages: [
        systemMsg,
        ...incomingMessages.map((m: any) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
        })),
      ],
      max_tokens: 900,
      temperature: 0.4,
      stream: false,
    };

    const upstreamRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(upstreamPayload),
    });

    const raw = await upstreamRes.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!upstreamRes.ok) {
      return NextResponse.json(
        {
          error: {
            message:
              data?.error?.message ||
              data?.message ||
              raw ||
              `Upstream error (${upstreamRes.status})`,
            status: upstreamRes.status,
          },
          debug: {
            month: requestedMonth,
            contextPreview: {
              totals: context.totals,
              subscriptionsThisMonth: context.subscriptionsThisMonth?.slice?.(0, 5),
            },
          },
        },
        { status: upstreamRes.status }
      );
    }

    const assistantText = extractAssistantTextFromUpstream(data);
    const normalizedJson = normalizeAssistantJson(assistantText || "");

    return NextResponse.json({
      output_text: normalizedJson,
      _context: context,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message || "Server error in /api/ai" } },
      { status: 500 }
    );
  }
}
