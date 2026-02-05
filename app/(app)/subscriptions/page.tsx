"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import SubscriptionCard from "../components/SubscriptionCard";
import { ensureRecurringTransactions } from "../lib/recurring";
import { BTN_GHOST, MUTED, MUTED2, PANEL } from "./lib/ui";

type Subscription = {
  id: string;
  user_id: string;
  name: string;
  amount_monthly: number;
  billing_day: number;
  created_at: string;
};

const POPULAR_SUBSCRIPTIONS = [
  "Netflix",
  "Spotify",
  "Amazon Prime",
  "Disney+",
  "Hulu",
  "Max",
  "YouTube Premium",
  "Apple One",
  "iCloud",
  "Xbox Game Pass",
  "PlayStation Plus",
  "Adobe",
  "Notion",
];

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

export default function SubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [billingDay, setBillingDay] = useState("");
  const [addMsg, setAddMsg] = useState("");

  const requireUser = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user?.id) {
      setErrorMsg("You must be logged in to view subscriptions.");
      setSubs([]);
      setLoading(false);
      return null;
    }

    return user;
  };

  const fetchSubs = async () => {
    setLoading(true);
    setErrorMsg("");

    const user = await requireUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,user_id,name,amount_monthly,billing_day,created_at")
      .eq("user_id", user.id)
      .order("billing_day", { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      setSubs([]);
      setLoading(false);
      return;
    }

    setSubs((data ?? []) as Subscription[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchSubs();
  }, []);

  const totalMonthly = useMemo(
    () => subs.reduce((s, x) => s + Number(x.amount_monthly), 0),
    [subs]
  );
  const totalAnnual = totalMonthly * 12;

  const today = new Date();
  const todayDay = today.getDate();
  const dueToday = subs.filter((s) => s.billing_day === todayDay);
  const dueSoon = subs.filter((s) => s.billing_day > todayDay && s.billing_day <= todayDay + 3);

  const addSubscription = async () => {
    setAddMsg("");
    const user = await requireUser();
    if (!user) return;

    const amt = Number(amount);
    const day = Number(billingDay);
    if (!name.trim()) {
      setAddMsg("Please enter a subscription name.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setAddMsg("Amount must be a positive number.");
      return;
    }
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      setAddMsg("Billing day must be between 1 and 31.");
      return;
    }

    const { error } = await supabase.from("subscriptions").insert({
      user_id: user.id,
      name: name.trim(),
      amount_monthly: amt,
      billing_day: day,
    });

    if (error) {
      setAddMsg(error.message);
      return;
    }

    setName("");
    setAmount("");
    setBillingDay("");
    await ensureRecurringTransactions(user.id);
    window.dispatchEvent(new Event("tx:changed"));
    fetchSubs();
  };

  const deleteSub = async (id: string) => {
    const { error } = await supabase.from("subscriptions").delete().eq("id", id);
    if (!error) fetchSubs();
  };

  return (
    <div className="relative isolate space-y-6 animate-[fadeIn_700ms_ease-out]">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-72 w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-amber-500/15 blur-3xl" />
        <div className="absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-gradient-to-br from-white/10 to-zinc-900/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_60%)]" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Overview</p>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Subscriptions</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Track recurring bills by billing day, not by month.
          </p>
        </div>
        <button onClick={fetchSubs} className={BTN_GHOST}>Refresh</button>
      </div>

      <div className={PANEL}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`text-sm ${MUTED}`}>Monthly total</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{money(totalMonthly)}</p>
            <p className={`mt-2 text-sm ${MUTED2}`}>Recurring every month</p>
          </div>
          <div>
            <p className={`text-sm ${MUTED}`}>Annual estimate</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{money(totalAnnual)}</p>
            <p className={`mt-2 text-sm ${MUTED2}`}>Monthly total × 12</p>
          </div>
          <div>
            <p className={`text-sm ${MUTED}`}>Due today</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{dueToday.length}</p>
            <p className={`mt-2 text-sm ${MUTED2}`}>Billing day is today</p>
          </div>
        </div>
      </div>

      <div className={PANEL}>
        <h3 className="text-lg font-semibold">Add subscription</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g., Netflix)"
            className="rounded-2xl border px-4 py-3 text-sm outline-none border-zinc-200/70 bg-white/70 text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Monthly amount"
            className="rounded-2xl border px-4 py-3 text-sm outline-none border-zinc-200/70 bg-white/70 text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50"
            inputMode="decimal"
          />
          <input
            value={billingDay}
            onChange={(e) => setBillingDay(e.target.value)}
            placeholder="Billing day (1-31)"
            className="rounded-2xl border px-4 py-3 text-sm outline-none border-zinc-200/70 bg-white/70 text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50"
            inputMode="numeric"
          />
        </div>
        <div className="mt-3">
          <p className={`text-xs uppercase tracking-[0.2em] ${MUTED2}`}>Popular</p>
          <div className="mt-2 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 flex-nowrap">
            {POPULAR_SUBSCRIPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setName(s)}
                className="rounded-full border px-3 py-1.5 text-xs transition border-zinc-200/70 bg-white/70 text-zinc-800 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:hover:bg-white/10"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={addSubscription} className="rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-black hover:opacity-90">
            Add subscription
          </button>
          {addMsg && <p className="text-sm text-emerald-500">{addMsg}</p>}
        </div>
      </div>

      <div className={PANEL}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Your subscriptions</h3>
          <span className="rounded-full border px-3 py-1 text-xs border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
            {subs.length} total
          </span>
        </div>

        {loading && <p className={`mt-3 ${MUTED}`}>Loading…</p>}
        {errorMsg && <p className="mt-3 text-sm text-red-500">{errorMsg}</p>}
        {!loading && subs.length === 0 && (
          <p className={`mt-3 ${MUTED}`}>No subscriptions yet.</p>
        )}

        {dueSoon.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Upcoming in 3 days: {dueSoon.map((s) => s.name).join(", ")}
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {subs.map((s) => (
            <SubscriptionCard
              key={s.id}
              name={s.name}
              billingDay={s.billing_day}
              amount={Number(s.amount_monthly)}
              totalMonthly={totalMonthly}
              onEdit={() => {}}
              onDelete={() => deleteSub(s.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
