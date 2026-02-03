"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCategoryMeta } from "../lib/categories";

import AddSubscriptionModal from "../components/AddSubscriptionModal";
import EditSubscriptionModal from "../components/EditSubscriptionModal";
import SubscriptionCard from "../components/SubscriptionCard";
import RecurringCard from "../components/RecurringCard";

import { BTN_GHOST, MUTED, MUTED2, PANEL, PANEL_SOFT } from "./lib/ui";

type Tx = {
  id: string;
  type: "expense" | "income";
  amount: number;
  category: string;
  note: string | null;
  occurred_on: string;
};

function monthKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
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

function dateFromMonthKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export default function SubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [addOpen, setAddOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editTx, setEditTx] = useState<{
    id: string;
    amount: number;
    note: string | null;
    occurred_on: string;
    category: string;
  } | null>(null);

  const requireUser = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user?.id) {
      setErrorMsg("You must be logged in to view subscriptions.");
      setTxs([]);
      setLoading(false);
      return null;
    }

    return user;
  };

  const fetchTx = async () => {
    setLoading(true);
    setErrorMsg("");

    const user = await requireUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("transactions")
      .select("id,type,amount,category,note,occurred_on")
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      setTxs([]);
      setLoading(false);
      return;
    }

    setTxs((data ?? []) as Tx[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchTx();

    const onChanged = () => fetchTx();
    window.addEventListener("tx:changed", onChanged);

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchTx();
    });

    return () => {
      window.removeEventListener("tx:changed", onChanged);
      sub?.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthOptions = useMemo(() => {
    const anchor = dateFromMonthKey(selectedMonth);
    const out: string[] = [];
    const d = new Date(anchor);
    d.setDate(1);

    d.setMonth(d.getMonth() + 2);
    for (let i = 0; i < 12; i++) {
      out.push(monthKey(d));
      d.setMonth(d.getMonth() - 1);
    }
    return out;
  }, [selectedMonth]);

  const monthTxs = useMemo(
    () => txs.filter((t) => (t.occurred_on ?? "").startsWith(selectedMonth)),
    [txs, selectedMonth]
  );

  const subsThisMonth = useMemo(() => {
    return monthTxs
      .filter((t) => t.type === "expense" && t.category === "Subscriptions")
      .map((t) => ({ ...t, displayName: (t.note || "Subscription").trim() }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));
  }, [monthTxs]);

  const total = useMemo(() => subsThisMonth.reduce((s, t) => s + Number(t.amount), 0), [subsThisMonth]);
  const biggest = useMemo(() => (subsThisMonth.length ? subsThisMonth[0] : null), [subsThisMonth]);
  const annual = useMemo(() => total * 12, [total]);

  const detectedRecurring = useMemo(() => {
    const expenses = txs.filter((t) => t.type === "expense" && Number(t.amount) > 0);
    const groups = new Map<string, { note: string; amount: number; months: Set<string> }>();

    for (const t of expenses) {
      const noteNorm = normalizeNote(t.note ?? "");
      if (!noteNorm || noteNorm.length < 3) continue;

      const amt = round2(Number(t.amount));
      const key = `${noteNorm}::${amt.toFixed(2)}`;
      const m = (t.occurred_on ?? "").slice(0, 7);

      if (!groups.has(key)) groups.set(key, { note: noteNorm, amount: amt, months: new Set() });
      groups.get(key)!.months.add(m);
    }

    const out: { key: string; note: string; amount: number; monthsCount: number; isInThisMonth: boolean }[] = [];
    for (const [key, g] of groups.entries()) {
      if (g.months.size < 3) continue;
      out.push({
        key,
        note: g.note,
        amount: g.amount,
        monthsCount: g.months.size,
        isInThisMonth: g.months.has(selectedMonth),
      });
    }

    out.sort((a, b) => Number(b.isInThisMonth) - Number(a.isInThisMonth) || b.amount - a.amount);
    return out.slice(0, 12);
  }, [txs, selectedMonth]);

  const deleteTx = async (id: string) => {
    setErrorMsg("");
    const user = await requireUser();
    if (!user) return;

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return setErrorMsg(error.message);
    window.dispatchEvent(new Event("tx:changed"));
  };

  const subsMeta = getCategoryMeta("Subscriptions");

  return (
    <div className="relative isolate space-y-6">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-72 w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-amber-500/15 blur-3xl" />
        <div className="absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-gradient-to-br from-white/10 to-zinc-900/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_60%)]" />
      </div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className={`text-sm ${MUTED2}`}>Overview</p>
          <div className="flex items-center gap-3">
            <h2 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Subscriptions
            </h2>
            <span className={`hidden sm:inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${subsMeta.chipClass}`}>
              <span>{subsMeta.icon}</span>
              <span className="font-semibold">Recurring</span>
            </span>
          </div>
          <p className={`text-sm ${MUTED}`}>
            Track recurring bills. For best results, put merchant names in the <b>note</b> field (e.g., “Netflix”, “iCloud”).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddOpen(true)}
            className="rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-black hover:opacity-90 active:scale-[0.99]"
          >
            + Add
          </button>
          <button onClick={fetchTx} className={BTN_GHOST}>
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {errorMsg}
        </div>
      )}

      {/* Month pills */}
      <div
        className={[
          PANEL_SOFT,
          "relative overflow-hidden",
          "bg-gradient-to-b from-zinc-50 to-white dark:from-white/5 dark:to-white/5",
        ].join(" ")}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0 w-full sm:flex-1">
            <div className="flex flex-wrap gap-2">
              {monthOptions.map((m) => {
                const active = m === selectedMonth;
                return (
                  <button
                    key={m}
                    onClick={() => setSelectedMonth(m)}
                    className={[
                      "rounded-full border px-4 py-2 text-sm transition",
                      active
                        ? "border-zinc-300/80 bg-white text-zinc-900 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-zinc-50"
                        : "border-zinc-200/70 bg-white/70 text-zinc-800 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:hover:bg-white/10",
                    ].join(" ")}
                  >
                    {monthLabel(m)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`text-sm ${MUTED} w-full sm:w-auto`}>
            Total:{" "}
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {money(total)}
            </span>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className={PANEL}>
          <p className={`text-sm ${MUTED}`}>Monthly total</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{money(total)}</p>
          <p className={`mt-2 text-sm ${MUTED2}`}>Subscriptions category in selected month</p>
        </div>

        <div className={PANEL}>
          <p className={`text-sm ${MUTED}`}>Annual estimate</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{money(annual)}</p>
          <p className={`mt-2 text-sm ${MUTED2}`}>Monthly total × 12</p>
        </div>

        <div className={PANEL}>
          <p className={`text-sm ${MUTED}`}>Biggest bill</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {biggest ? money(Number((biggest as any).amount)) : "—"}
          </p>
          <p className={`mt-2 text-sm ${MUTED2}`}>
            {biggest ? (biggest as any).displayName : "No subscriptions logged this month"}
          </p>
        </div>
      </div>

      {/* Logged */}
      <div className={PANEL}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Logged this month</h3>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${subsMeta.chipClass}`}>
            <span>{subsMeta.icon}</span>
            <span>{subsThisMonth.length} item(s)</span>
          </span>
        </div>

        {loading && <p className={`mt-3 ${MUTED}`}>Loading…</p>}

        {!loading && subsThisMonth.length === 0 && (
          <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-5 dark:border-white/10 dark:bg-white/5">
            <p className={`text-sm ${MUTED}`}>No subscriptions recorded for this month.</p>
            <button
              onClick={() => setAddOpen(true)}
              className="mt-4 rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-black hover:opacity-90 active:scale-[0.99]"
            >
              + Add subscription
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(subsThisMonth as any[]).map((t) => (
            <SubscriptionCard
              key={t.id}
              name={t.displayName}
              occurredOn={t.occurred_on}
              amount={Number(t.amount)}
              total={total}
              onEdit={() => {
                setEditTx({
                  id: t.id,
                  amount: Number(t.amount),
                  note: t.note ?? t.displayName,
                  occurred_on: t.occurred_on,
                  category: t.category,
                });
                setEditOpen(true);
              }}
              onDelete={() => deleteTx(t.id)}
            />
          ))}
        </div>
      </div>

      {/* Detected recurring */}
      <div className={PANEL}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Detected recurring</h3>
            <p className={`text-sm mt-1 ${MUTED}`}>
              Based on repeated expenses with the same <b>note + amount</b> across ≥ 3 months.
            </p>
          </div>

          <span className="rounded-full border px-3 py-1 text-xs border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
            {detectedRecurring.length} found
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {detectedRecurring.map((s) => (
            <RecurringCard
              key={s.key}
              note={s.note}
              amount={s.amount}
              monthsCount={s.monthsCount}
              isInThisMonth={s.isInThisMonth}
            />
          ))}
        </div>
      </div>

      {/* Modals */}
      <AddSubscriptionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultMonth={selectedMonth}
        onAdded={(occurredOn) => {
          setSelectedMonth(occurredOn.slice(0, 7));
        }}
      />

      <EditSubscriptionModal
        open={editOpen}
        tx={editTx}
        onClose={() => setEditOpen(false)}
        onUpdated={fetchTx}
      />
    </div>
  );
}
