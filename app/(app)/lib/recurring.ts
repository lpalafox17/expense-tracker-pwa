import { supabase } from "@/lib/supabaseClient";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function dayFromISO(iso: string) {
  const d = Number(iso.slice(8, 10));
  return Number.isFinite(d) ? d : 0;
}

function isWithinEarlyWindow(day: number, dueDay: number, payEarly: number) {
  const start = Math.max(1, dueDay - payEarly);
  return day >= start && day <= dueDay;
}

export async function ensureRecurringTransactions(userId: string) {
  const today = new Date();
  const todayDay = today.getDate();
  const iso = todayISO();

  const [subsRes, billsRes, txRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id,name,amount_monthly,billing_day")
      .eq("user_id", userId)
      .eq("billing_day", todayDay),
    supabase
      .from("recurring_bills")
      .select("id,name,amount,category,due_day")
      .eq("user_id", userId)
      .eq("due_day", todayDay),
    supabase
      .from("transactions")
      .select("id,note,amount,category,type,occurred_on,subscription_id,recurring_bill_id")
      .eq("user_id", userId)
      .eq("occurred_on", iso),
  ]);

  if (subsRes.error || billsRes.error || txRes.error) {
    return;
  }

  const txToday = (txRes.data ?? []) as Array<{
    id: string;
    note: string | null;
    amount: number;
    category: string;
    type: string;
    occurred_on: string;
    subscription_id?: string | null;
    recurring_bill_id?: string | null;
  }>;

  const missingSubs: Array<{
    user_id: string;
    type: "expense";
    amount: number;
    category: string;
    note: string;
    occurred_on: string;
    subscription_id?: string;
  }> = [];
  const missingBills: Array<{
    user_id: string;
    type: "expense";
    amount: number;
    category: string;
    note: string;
    occurred_on: string;
    recurring_bill_id?: string;
  }> = [];

  const hasTx = (note: string, amount: number, category: string) =>
    txToday.some(
      (t) =>
        t.type === "expense" &&
        t.category === category &&
        Number(t.amount) === Number(amount) &&
        (t.note ?? "") === note
    );

  for (const s of subsRes.data ?? []) {
    const note = (s.name || "Subscription").trim();
    const amt = Number(s.amount_monthly) || 0;
    const already = txToday.some((t) => t.subscription_id === s.id);
    if (!already && !hasTx(note, amt, "Subscriptions")) {
      missingSubs.push({
        user_id: userId,
        type: "expense",
        amount: amt,
        category: "Subscriptions",
        note,
        occurred_on: iso,
        subscription_id: s.id,
      });
    }
  }

  for (const b of billsRes.data ?? []) {
    const note = (b.name || "Bill").trim();
    const amt = Number(b.amount) || 0;
    const category = b.category || "Other";
    const already = txToday.some((t) => t.recurring_bill_id === b.id);
    if (!already && !hasTx(note, amt, category)) {
      missingBills.push({
        user_id: userId,
        type: "expense",
        amount: amt,
        category,
        note,
        occurred_on: iso,
        recurring_bill_id: b.id,
      });
    }
  }

  if (missingSubs.length) {
    const upsertRes = await supabase.from("transactions").upsert(missingSubs, {
      onConflict: "user_id,subscription_id,occurred_on",
    });
    if (upsertRes.error) {
      await supabase.from("transactions").insert(missingSubs);
    }
  }
  if (missingBills.length) {
    const upsertRes = await supabase.from("transactions").upsert(missingBills, {
      onConflict: "user_id,recurring_bill_id,occurred_on",
    });
    if (upsertRes.error) {
      await supabase.from("transactions").insert(missingBills);
    }
  }
}

export async function matchRecurringForTransaction({
  userId,
  occurredOn,
  note,
  amount,
  category,
}: {
  userId: string;
  occurredOn: string;
  note: string;
  amount: number;
  category: string;
}): Promise<{ subscription_id?: string; recurring_bill_id?: string }> {
  const day = dayFromISO(occurredOn);
  const normalizedNote = normalizeText(note);

  if (category === "Subscriptions") {
    const { data } = await supabase
      .from("subscriptions")
      .select("id,name,amount_monthly,billing_day")
      .eq("user_id", userId)
      .eq("billing_day", day);
    const match = (data ?? []).find((s: any) => {
      const name = normalizeText(s.name || "");
      const amt = Number(s.amount_monthly) || 0;
      return amt === Number(amount) && (name === normalizedNote || name.includes(normalizedNote) || normalizedNote.includes(name));
    });
    if (match) return { subscription_id: match.id };
    return {};
  }

  const { data } = await supabase
    .from("recurring_bills")
    .select("id,name,amount,category,due_day,pay_early_days")
    .eq("user_id", userId)
    .eq("category", category);

  const match = (data ?? []).find((b: any) => {
    const name = normalizeText(b.name || "");
    const amt = Number(b.amount) || 0;
    const due = Number(b.due_day) || 0;
    const early = Number(b.pay_early_days) || 0;
    if (!isWithinEarlyWindow(day, due, early)) return false;
    return amt === Number(amount) && (name === normalizedNote || name.includes(normalizedNote) || normalizedNote.includes(name));
  });

  if (match) return { recurring_bill_id: match.id };
  return {};
}
