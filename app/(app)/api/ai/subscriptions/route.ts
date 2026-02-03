import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Tx = {
  type: "expense" | "income";
  amount: number;
  category: string;
  note: string | null;
  occurred_on: string;
};

function normalizeNote(note: string) {
  return note.toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function detectSubscriptions(txs: Tx[]) {
  const groups = new Map<string, Set<string>>();
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const note = normalizeNote(t.note ?? "");
    if (!note || note.length < 3) continue;
    const amt = round2(Number(t.amount)).toFixed(2);
    const m = (t.occurred_on ?? "").slice(0, 7);
    const key = `${t.category}::${note}::${amt}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(m);
  }

  const out: any[] = [];
  for (const [k, months] of groups.entries()) {
    if (months.size >= 3) {
      const [category, note, amt] = k.split("::");
      out.push({
        category,
        note,
        amount: Number(amt),
        monthsSeen: months.size,
        confidence: months.size >= 5 ? "high" : months.size >= 4 ? "medium" : "low",
      });
    }
  }
  out.sort((a, b) => b.monthsSeen - a.monthsSeen || b.amount - a.amount);
  return out.slice(0, 25);
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token) return NextResponse.json({ error: { message: "Missing Bearer token" } }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.json({ error: { message: "Missing Supabase env vars" } }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return NextResponse.json({ error: { message: "Invalid session" } }, { status: 401 });
  }

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const sixStart = sixMonthsAgo.toISOString().slice(0, 10);
  const sixEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("transactions")
    .select("type,amount,category,note,occurred_on")
    .gte("occurred_on", sixStart)
    .lt("occurred_on", sixEnd);

  if (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }

  const subs = detectSubscriptions((data ?? []) as Tx[]);
  return NextResponse.json({ subscriptions: subs, window: { sixStart, sixEnd } });
}