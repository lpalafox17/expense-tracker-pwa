"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CATEGORIES, getCategoryMeta } from "../lib/categories";
import { formatDateMDY } from "../lib/date";
import { ensureRecurringTransactions } from "../lib/recurring";

type TxType = "expense" | "income";

type Tx = {
  id: string;
  user_id: string;
  type: TxType;
  amount: number;
  category: string;
  note: string | null;
  occurred_on: string;
  created_at: string;
};

type RecurringBill = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  category: string;
  due_day: number;
  pay_early_days: number;
  created_at: string;
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
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysInMonth(yyyy: number, mm1to12: number) {
  return new Date(yyyy, mm1to12, 0).getDate();
}

function nextDueDate(dueDay: number) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = today.getMonth() + 1;
  const dim = daysInMonth(yyyy, mm);
  const day = Math.min(dueDay, dim);
  const candidate = new Date(yyyy, mm - 1, day);
  if (candidate >= new Date(yyyy, mm - 1, today.getDate())) {
    return candidate;
  }
  const nextMonth = new Date(yyyy, mm, 1);
  const dimNext = daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth() + 1);
  return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(dueDay, dimNext));
}

function daysUntil(date: Date) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

const SURFACE =
  "rounded-[32px] sm:rounded-[28px] border p-4 sm:p-5 backdrop-blur-xl " +
  "border-zinc-200/70 bg-white/70 text-zinc-900 shadow-[0_10px_40px_-28px_rgba(0,0,0,0.4)] " +
  "dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:shadow-none";

const SURFACE_SOFT =
  "rounded-[24px] sm:rounded-[20px] border px-4 py-3 backdrop-blur " +
  "border-zinc-200/70 bg-white/70 text-zinc-900 " +
  "dark:border-white/10 dark:bg-white/5 dark:text-zinc-50";

const BTN_GHOST =
  "rounded-2xl border px-4 py-2 transition " +
  "border-zinc-200/70 bg-white/70 hover:bg-white " +
  "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10";

export default function TransactionsPage() {
  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [billMsg, setBillMsg] = useState("");
  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billCategory, setBillCategory] = useState("Other");
  const [billDueDay, setBillDueDay] = useState("");
  const [billPayEarly, setBillPayEarly] = useState("3");

  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [typeFilter, setTypeFilter] = useState<TxType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "list">("list");

  const monthOptions = useMemo(() => {
    const out: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < 12; i++) {
      out.push(monthKey(d));
      d.setMonth(d.getMonth() - 1);
    }
    return out;
  }, []);

  const fetchTx = async () => {
    setLoading(true);
    setErrorMsg("");

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (userId) {
      await ensureRecurringTransactions(userId);
    }

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_on", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      setTxs([]);
    } else {
      setTxs((data ?? []) as Tx[]);
    }

    if (userId) {
      const { data: billData, error: billErr } = await supabase
        .from("recurring_bills")
        .select("id,user_id,name,amount,category,due_day,pay_early_days,created_at")
        .eq("user_id", userId)
        .order("due_day", { ascending: true });
      if (!billErr) {
        setBills((billData ?? []) as RecurringBill[]);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchTx();
    const onChanged = () => fetchTx();
    window.addEventListener("tx:changed", onChanged);
    return () => window.removeEventListener("tx:changed", onChanged);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return txs
      .filter((t) => t.occurred_on.startsWith(selectedMonth))
      .filter((t) => (typeFilter === "all" ? true : t.type === typeFilter))
      .filter((t) => (categoryFilter === "all" ? true : t.category === categoryFilter))
      .filter((t) => {
        if (!q) return true;
        const hay = `${t.category} ${t.note ?? ""} ${t.amount}`.toLowerCase();
        return hay.includes(q);
      });
  }, [txs, selectedMonth, typeFilter, categoryFilter, query]);

  const summary = useMemo(() => {
    const income = filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [filtered]);

  const delTx = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (!error) window.dispatchEvent(new Event("tx:changed"));
  };

  const addBill = async () => {
    setBillMsg("");
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      setBillMsg("Not logged in.");
      return;
    }
    const amt = Number(billAmount);
    const dueDay = Number(billDueDay);
    const payEarly = Number(billPayEarly);
    if (!billName.trim()) {
      setBillMsg("Please enter a bill name.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setBillMsg("Amount must be a positive number.");
      return;
    }
    if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) {
      setBillMsg("Due day must be 1–31.");
      return;
    }
    const { error } = await supabase.from("recurring_bills").insert({
      user_id: userId,
      name: billName.trim(),
      amount: amt,
      category: billCategory,
      due_day: dueDay,
      pay_early_days: Number.isFinite(payEarly) ? payEarly : 3,
    });
    if (error) {
      setBillMsg(error.message);
      return;
    }
    setBillName("");
    setBillAmount("");
    setBillDueDay("");
    setBillPayEarly("3");
    await ensureRecurringTransactions(userId);
    window.dispatchEvent(new Event("tx:changed"));
    fetchTx();
  };

  const deleteBill = async (id: string) => {
    const { error } = await supabase.from("recurring_bills").delete().eq("id", id);
    if (!error) fetchTx();
  };

  return (
    <div className="relative isolate space-y-6 animate-[fadeIn_700ms_ease-out]">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-72 w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-amber-500/15 blur-3xl" />
        <div className="absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-gradient-to-br from-white/10 to-zinc-900/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_60%)]" />
      </div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Overview</p>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Transactions</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Filter, search, and review your activity.</p>
        </div>

        <button onClick={fetchTx} className={BTN_GHOST}>
          Refresh
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {/* Filters */}
          <div className={`${SURFACE} grid gap-3 lg:grid-cols-4`}>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className={SURFACE_SOFT}>
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className={SURFACE_SOFT}>
          <option value="all">All</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>

        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={SURFACE_SOFT}>
          <option value="all">All</option>
          {CATEGORIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search note/category/amount"
          className={SURFACE_SOFT}
        />
          </div>

          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={SURFACE}>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Income</p>
              <p className="text-3xl font-semibold text-emerald-700 dark:text-emerald-300">
                ${money(summary.income)}
              </p>
              <div className="mt-3 h-1 w-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-cyan-400" />
            </div>
            <div className={SURFACE}>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Expenses</p>
              <p className="text-3xl font-semibold text-rose-600 dark:text-rose-300">
                ${money(summary.expense)}
              </p>
              <div className="mt-3 h-1 w-full rounded-full bg-gradient-to-r from-rose-400 via-rose-500 to-orange-400" />
            </div>
            <div className={SURFACE}>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Net</p>
              <p
                className={`text-3xl font-semibold ${
                  summary.net < 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"
                }`}
              >
                ${money(summary.net)}
              </p>
              <div
                className={[
                  "mt-3 h-1 w-full rounded-full",
                  summary.net < 0
                    ? "bg-gradient-to-r from-rose-400 via-rose-500 to-orange-400"
                    : "bg-gradient-to-r from-emerald-400 via-emerald-500 to-cyan-400",
                ].join(" ")}
              />
            </div>
          </div>

          {/* Feed */}
          <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Transactions</h3>
          <div className="inline-flex rounded-full border border-zinc-200/70 bg-white/70 p-1 dark:border-white/10 dark:bg-white/5">
            <button
              onClick={() => setViewMode("list")}
              className={[
                "rounded-full px-3 py-1 text-sm transition",
                viewMode === "list"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white",
              ].join(" ")}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={[
                "rounded-full px-3 py-1 text-sm transition",
                viewMode === "table"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white",
              ].join(" ")}
            >
              Table
            </button>
          </div>
        </div>

        {viewMode === "table" && (
          <div
            className={[
              "hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3",
              "rounded-2xl border px-4 py-3 text-xs uppercase tracking-[0.12em]",
              "border-zinc-200/70 bg-white/70 text-zinc-500",
              "dark:border-white/10 dark:bg-white/5 dark:text-zinc-300",
            ].join(" ")}
          >
            <span>Category</span>
            <span>Date</span>
            <span>Type</span>
            <span>Amount</span>
            <span className="text-right">Action</span>
          </div>
        )}

        {filtered.map((t) => {
          const meta = getCategoryMeta(t.category);
          const isExpense = t.type === "expense";

          const amountClass = isExpense
            ? "text-red-600 dark:text-red-300"
            : "text-emerald-700 dark:text-emerald-300";

          return (
            <div key={t.id} className={`${SURFACE} p-4`}>
              {viewMode === "table" ? (
                <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs ${meta.chipClass}`}>
                        {meta.icon} {meta.name}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-300">{t.note || "—"}</span>
                    </div>
                  </div>

                  <div className="text-sm tabular-nums">{formatDateMDY(t.occurred_on)}</div>

                  <div
                    className={[
                      "inline-flex w-fit rounded-full border px-3 py-1 text-xs",
                      isExpense
                        ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200",
                    ].join(" ")}
                  >
                    {isExpense ? "Expense" : "Income"}
                  </div>

                  <div className={`text-sm font-semibold tabular-nums ${amountClass}`}>
                    {isExpense ? "−" : "+"}${money(t.amount)}
                  </div>

                  <div className="flex justify-end">
                    <button onClick={() => delTx(t.id)} className={BTN_GHOST}>
                      🗑️
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs ${meta.chipClass}`}>
                        {meta.icon} {meta.name}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-300">{formatDateMDY(t.occurred_on)}</span>
                      <span
                        className={[
                          "rounded-full border px-3 py-1 text-xs",
                          isExpense
                            ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200",
                        ].join(" ")}
                      >
                        {isExpense ? "Expense" : "Income"}
                      </span>
                    </div>

                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{t.note || "—"}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <p className={`text-lg font-semibold tabular-nums ${amountClass}`}>
                      {isExpense ? "−" : "+"}${money(t.amount)}
                    </p>

                    <button onClick={() => delTx(t.id)} className={BTN_GHOST}>
                      🗑️
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
          </div>
        </div>

        <div className={`${SURFACE} h-fit`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Recurring bills</p>
              <p className="text-xs opacity-70">Due soon + upcoming</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs opacity-80">
              {bills.length} total
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {bills.map((b) => {
              const due = nextDueDate(b.due_day);
              const days = daysUntil(due);
              const dueSoon = days <= b.pay_early_days;
              return (
                <div key={b.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{b.name}</p>
                    <span className="text-sm font-semibold">{money(b.amount)}</span>
                  </div>
                  <p className="mt-1 text-xs opacity-70">
                    {b.category} • Due {formatDateMDY(due.toISOString().slice(0, 10))} • Pay {b.pay_early_days}d early
                  </p>
                  {dueSoon && (
                    <span className="mt-2 inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                      Due soon
                    </span>
                  )}
                  <div className="mt-2 flex justify-end">
                    <button onClick={() => deleteBill(b.id)} className={BTN_GHOST}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
            {bills.length === 0 && (
              <p className="text-sm opacity-70">No recurring bills yet.</p>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-sm font-semibold">Add a bill</p>
            <div className="mt-2 space-y-2">
              <input
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
                placeholder="Name (Rent, Car Payment)"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              />
              <input
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                placeholder="Amount"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                inputMode="decimal"
              />
              <select
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  value={billDueDay}
                  onChange={(e) => setBillDueDay(e.target.value)}
                  placeholder="Due day (1-31)"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                  inputMode="numeric"
                />
                <input
                  value={billPayEarly}
                  onChange={(e) => setBillPayEarly(e.target.value)}
                  placeholder="Pay early (days)"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={addBill} className={BTN_GHOST}>
                Add bill
              </button>
              {billMsg && <span className="text-xs text-emerald-300">{billMsg}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
