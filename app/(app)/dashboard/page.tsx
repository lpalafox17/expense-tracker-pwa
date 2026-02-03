"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCategoryMeta } from "../lib/categories";

// ✅ IMPORTANT: update this import to the real path of your modal file
// Examples:
// import AddTransactionModal from "../components/AddTransactionModal";
// import AddTransactionModal from "@/components/AddTransactionModal";
import AddTransactionModal from "../components/AddTransactionModal";

type Tx = {
  id: string;
  type: "expense" | "income";
  amount: number;
  category: string;
  note: string | null;
  occurred_on: string; // YYYY-MM-DD
};

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

function prevMonthKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return monthKey(d);
}

function monthRange(key: string) {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pct(n: number) {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n * 100)}%`;
}

function daysInMonth(yyyy: number, mm1to12: number) {
  return new Date(yyyy, mm1to12, 0).getDate();
}

function niceDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleString(undefined, { month: "short", day: "numeric" });
}

/** Simple SVG bar chart for daily expenses */
function DailyBars({
  points,
  height = 140,
}: {
  points: { day: number; value: number }[];
  height?: number;
}) {
  const maxV = Math.max(1, ...points.map((p) => p.value));
  const bars = points.length;

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950/60">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm opacity-70">Expenses by day</p>
          <p className="text-xs opacity-60">Bars scale to this month’s max day</p>
        </div>

        <div className="text-xs opacity-60 tabular-nums">
          Max day: <span className="font-semibold">{money(maxV)}</span>
        </div>
      </div>

      <div className="mt-4">
        <svg
          viewBox={`0 0 ${bars * 10} ${height}`}
          className="w-full"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            y1={height - 1}
            x2={bars * 10}
            y2={height - 1}
            className="stroke-zinc-200 dark:stroke-white/10"
            strokeWidth="1"
          />
          {points.map((p, i) => {
            const barH = Math.round((p.value / maxV) * (height - 14));
            const x = i * 10 + 2;
            const y = height - 2 - barH;
            const isZero = p.value <= 0;

            return (
              <g key={p.day}>
                <rect
                  x={x}
                  y={y}
                  width="6"
                  height={barH}
                  rx="2"
                  className={
                    isZero
                      ? "fill-zinc-200 dark:fill-white/10"
                      : "fill-emerald-500"
                  }
                  opacity={isZero ? 0.35 : 1}
                />
              </g>
            );
          })}
        </svg>

        <div className="mt-3 flex items-center justify-between text-xs opacity-60">
          <span>Day 1</span>
          <span>End of month</span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  // ✅ Modal open state
  const [addOpen, setAddOpen] = useState(false);

  // ✅ Listen for "tx:add" events anywhere (header button, empty state CTA, etc.)
  useEffect(() => {
    const handler = () => setAddOpen(true);
    window.addEventListener("tx:add", handler);
    return () => window.removeEventListener("tx:add", handler);
  }, []);

  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));

  const monthOptions = useMemo(() => {
    const out: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < 8; i++) {
      out.push(monthKey(d));
      d.setMonth(d.getMonth() - 1);
    }
    return out;
  }, []);

  const thisMonthKey = selectedMonth;
  const lastMonthKey = useMemo(() => prevMonthKey(thisMonthKey), [thisMonthKey]);

  const fetchTx = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    const { start: startLast } = monthRange(lastMonthKey);
    const { end: endThis } = monthRange(thisMonthKey);

    const { data, error } = await supabase
      .from("transactions")
      .select("id,type,amount,category,note,occurred_on")
      .gte("occurred_on", startLast)
      .lt("occurred_on", endThis)
      .order("occurred_on", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      setTxs([]);
      setLoading(false);
      return;
    }

    setTxs((data ?? []) as Tx[]);
    setLoading(false);
  }, [thisMonthKey, lastMonthKey]);

  useEffect(() => {
    fetchTx();
  }, [fetchTx]);

  useEffect(() => {
    const onChanged = () => fetchTx();
    window.addEventListener("tx:changed", onChanged);
    return () => window.removeEventListener("tx:changed", onChanged);
  }, [fetchTx]);

  const thisMonthTxs = useMemo(
    () => txs.filter((t) => (t.occurred_on ?? "").startsWith(thisMonthKey)),
    [txs, thisMonthKey]
  );

  const lastMonthTxs = useMemo(
    () => txs.filter((t) => (t.occurred_on ?? "").startsWith(lastMonthKey)),
    [txs, lastMonthKey]
  );

  const income = useMemo(
    () =>
      thisMonthTxs
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + Number(t.amount), 0),
    [thisMonthTxs]
  );

  const expenses = useMemo(
    () =>
      thisMonthTxs
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + Number(t.amount), 0),
    [thisMonthTxs]
  );

  const net = useMemo(() => income - expenses, [income, expenses]);

  const lastExpenses = useMemo(
    () =>
      lastMonthTxs
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + Number(t.amount), 0),
    [lastMonthTxs]
  );

  const momExpenseDelta = useMemo(() => {
    if (lastExpenses <= 0) return null;
    return (expenses - lastExpenses) / lastExpenses;
  }, [expenses, lastExpenses]);

  const [y, m] = useMemo(() => thisMonthKey.split("-").map(Number), [thisMonthKey]);
  const totalDays = useMemo(() => daysInMonth(y, m), [y, m]);

  const daysElapsed = useMemo(() => {
    const now = new Date();
    const [yy, mm] = thisMonthKey.split("-").map(Number);
    const isCurrentMonth = now.getFullYear() === yy && now.getMonth() + 1 === mm;
    return isCurrentMonth ? now.getDate() : totalDays;
  }, [thisMonthKey, totalDays]);

  const avgDailySpend = useMemo(
    () => expenses / Math.max(1, daysElapsed),
    [expenses, daysElapsed]
  );

  const dailyPoints = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 1; i <= totalDays; i++) map.set(i, 0);

    for (const t of thisMonthTxs) {
      if (t.type !== "expense") continue;
      const day = Number((t.occurred_on ?? "").slice(8, 10));
      map.set(day, (map.get(day) ?? 0) + Number(t.amount));
    }

    return Array.from(map.entries()).map(([day, value]) => ({ day, value }));
  }, [thisMonthTxs, totalDays]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of thisMonthTxs) {
      if (t.type !== "expense") continue;
      map.set(t.category, (map.get(t.category) ?? 0) + Number(t.amount));
    }
    const arr = Array.from(map.entries())
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);

    return arr.slice(0, 5);
  }, [thisMonthTxs]);

  const recentTx = useMemo(() => {
    return thisMonthTxs
      .slice()
      .sort((a, b) => (b.occurred_on ?? "").localeCompare(a.occurred_on ?? ""))
      .slice(0, 6);
  }, [thisMonthTxs]);

  const insightText = useMemo(() => {
    if (lastExpenses <= 0 && expenses <= 0)
      return "No spending yet. Add a few transactions to unlock trends.";
    if (lastExpenses <= 0 && expenses > 0)
      return "No last-month baseline yet — keep logging to unlock comparisons.";
    if (momExpenseDelta === null)
      return "Keep logging to unlock month-over-month insights.";
    const d = momExpenseDelta;
    if (d <= -0.15) return "Nice — spending is down meaningfully vs last month.";
    if (d < 0.15) return "You’re roughly on track vs last month.";
    return "Heads up — spending is up vs last month. Check top categories.";
  }, [expenses, lastExpenses, momExpenseDelta]);

  const deltaChip = useMemo(() => {
    if (momExpenseDelta === null) return null;
    const d = momExpenseDelta;
    const up = d > 0;
    return {
      text: `${up ? "Up" : "Down"} ${pct(Math.abs(d))} vs last month`,
      className: up
        ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    };
  }, [momExpenseDelta]);

  return (
    <>
      <div className="relative isolate space-y-6">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-72 w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-amber-500/15 blur-3xl" />
          <div className="absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-gradient-to-br from-white/10 to-zinc-900/20 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_60%)]" />
        </div>
        {/* Hero header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm opacity-70">Overview</p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-2 text-sm opacity-70">
              A quick pulse check of your month — income, spend, and what’s driving it.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-zinc-950/60">
              <span className="opacity-70 mr-2">Month</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent outline-none font-semibold"
              >
                {monthOptions.map((k) => (
                  <option key={k} value={k}>
                    {monthLabel(k)}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={fetchTx}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-950/60 dark:hover:bg-white/5"
            >
              Refresh
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-200">
            {errorMsg}
          </div>
        )}

        {/* Metrics */}
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm opacity-70">Income</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{money(income)}</p>
                <p className="mt-2 text-sm opacity-60">This month</p>
              </div>
              <div className="h-11 w-11 rounded-2xl border border-zinc-200 bg-zinc-50 flex items-center justify-center dark:border-white/10 dark:bg-white/5">
                💰
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm opacity-70">Expenses</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{money(expenses)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {deltaChip ? (
                    <span className={`rounded-full border px-3 py-1 text-xs ${deltaChip.className}`}>
                      {deltaChip.text}
                    </span>
                  ) : (
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs opacity-70 dark:border-white/10 dark:bg-white/5">
                      No baseline yet
                    </span>
                  )}
                </div>
              </div>
              <div className="h-11 w-11 rounded-2xl border border-zinc-200 bg-zinc-50 flex items-center justify-center dark:border-white/10 dark:bg-white/5">
                🧾
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm opacity-70">Net</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{money(net)}</p>
                <p className="mt-2 text-sm opacity-60">Income − Expenses</p>
              </div>
              <div className="h-11 w-11 rounded-2xl border border-zinc-200 bg-zinc-50 flex items-center justify-center dark:border-white/10 dark:bg-white/5">
                📈
              </div>
            </div>
          </div>
        </div>

        {/* Mid grid */}
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Insights */}
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Insights</h3>
                <p className="mt-2 text-sm opacity-70">{insightText}</p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs opacity-80 dark:border-white/10 dark:bg-white/5">
                {monthLabel(thisMonthKey)}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm opacity-70">Avg daily spend</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {money(avgDailySpend)}
                </p>
                <p className="mt-2 text-xs opacity-60">
                  Average so far {thisMonthKey === monthKey(new Date()) ? "(days elapsed)" : "(full month)"}
                </p>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm opacity-70">Top category</p>
                <p className="mt-1 text-2xl font-bold truncate">
                  {topCategories[0]?.category ?? "—"}
                </p>
                <p className="mt-2 text-xs opacity-60 tabular-nums">
                  {topCategories[0] ? money(topCategories[0].value) : "No expenses yet"}
                </p>
              </div>
            </div>

            {/* Top categories list */}
            <div className="mt-4">
              <p className="text-sm font-semibold">Top categories</p>
              <div className="mt-3 space-y-2">
                {topCategories.length === 0 ? (
                  <p className="text-sm opacity-70">No expense categories yet.</p>
                ) : (
                  topCategories.map((c) => {
                    const meta = getCategoryMeta(c.category);
                    const share = expenses > 0 ? c.value / expenses : 0;

                    return (
                      <div
                        key={c.category}
                        className="rounded-3xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${meta.chipClass}`}
                            >
                              <span>{meta.icon}</span>
                              <span className="truncate">{meta.name}</span>
                            </span>
                            <span className="text-xs opacity-60 tabular-nums">
                              {Math.round(share * 100)}%
                            </span>
                          </div>

                          <div className="text-sm font-semibold tabular-nums">
                            {money(c.value)}
                          </div>
                        </div>

                        <div className="mt-2 h-2 w-full rounded-full bg-zinc-200/70 overflow-hidden dark:bg-white/10">
                          <div
                            className="h-full bg-emerald-500 transition-[width] duration-300"
                            style={{ width: `${Math.round(clamp(share, 0, 1) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Chart */}
          <DailyBars points={dailyPoints} />
        </div>

        {/* Recent transactions */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/60">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Recent this month</h3>
            <span className="text-xs opacity-60">
              {loading ? "Loading…" : `${recentTx.length} shown`}
            </span>
          </div>

          {loading && <p className="mt-3 opacity-70">Loading…</p>}

          {!loading && recentTx.length === 0 && (
            <div className="mt-3 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm opacity-70">
                Nothing logged for this month yet. Add your first transaction to unlock insights.
              </p>
              <button
                onClick={() => window.dispatchEvent(new Event("tx:add"))}
                className="mt-3 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                + Add transaction
              </button>
            </div>
          )}

          <div className="mt-4 grid gap-2">
            {recentTx.map((t) => {
              const meta = getCategoryMeta(t.category);
              const isExpense = t.type === "expense";
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-3xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${meta.chipClass}`}
                      >
                        <span>{meta.icon}</span>
                        <span className="truncate">{meta.name}</span>
                      </span>

                      <span className="text-xs opacity-60">
                        {niceDate(t.occurred_on)}
                        {t.note ? ` • ${t.note}` : ""}
                      </span>
                    </div>
                  </div>

                  <div
                    className={[
                      "text-sm font-semibold tabular-nums",
                      isExpense
                        ? "text-red-600 dark:text-red-200"
                        : "text-emerald-700 dark:text-emerald-200",
                    ].join(" ")}
                  >
                    {isExpense ? "-" : "+"}
                    {money(Number(t.amount))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ✅ Modal mounted once here */}
      <AddTransactionModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
