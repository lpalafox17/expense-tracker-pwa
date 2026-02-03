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

    // ✅ NEW: subscriptions this month (this is what your UI shows)
    const subsThisMonthRaw = thisMonthTxs
      .filter((t) => t.type === "expense" && t.category === "Subscriptions")
      .map((t) => ({
        id: t.id,
        name: (t.note || "Subscription").trim(),
        amountMonthly: round2(Number(t.amount)),
        amountAnnual: round2(Number(t.amount) * 12),
        occurred_on: t.occurred_on,
      }))
      .sort((a, b) => b.amountMonthly - a.amountMonthly);

    // Group duplicates (same name) -> combined monthly + annual
    const subAgg = new Map<string, { name: string; amountMonthly: number; amountAnnual: number }>();
    for (const s of subsThisMonthRaw) {
      const key = normalizeNote(s.name);
      const prev = subAgg.get(key);
      if (!prev) {
        subAgg.set(key, { name: s.name, amountMonthly: s.amountMonthly, amountAnnual: s.amountAnnual });
      } else {
        prev.amountMonthly = round2(prev.amountMonthly + s.amountMonthly);
        prev.amountAnnual = round2(prev.amountAnnual + s.amountAnnual);
      }
    }
    const subscriptionsThisMonth = Array.from(subAgg.values()).sort((a, b) => b.amountMonthly - a.amountMonthly);

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
      budgetUsage,

      // ✅ NEW: explicit subscription list for the selected month
      subscriptionsThisMonth, // [{ name, amountMonthly, amountAnnual }]

      // Still useful: “recurring across months” detector
      possibleSubscriptions,

      notes: [
        "All values are derived from this user's transaction data.",
        "For subscription questions, prefer subscriptionsThisMonth if present.",
        "possibleSubscriptions requires >= 3 distinct months of repeats.",
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
        "Return concise, actionable advice.\n\n" +
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

    return NextResponse.json({
      ...data,
      _context: context,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message || "Server error in /api/ai" } },
      { status: 500 }
    );
  }
}