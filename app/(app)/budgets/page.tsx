"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CATEGORIES, getCategoryMeta } from "../lib/categories";
import EditBudgetModal from "../components/EditBudgetModal";

type Budget = {
  id: string;
  user_id: string;
  category: string;
  monthly_limit: number;
  created_at: string;
};

type Tx = {
  id: string;
  type: "expense" | "income";
  amount: number;
  category: string;
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

function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

/* ---------- Modern theme helpers (works in light/dark) ---------- */
const SURFACE =
  "rounded-[32px] sm:rounded-[28px] border p-4 sm:p-5 backdrop-blur-xl " +
  "border-zinc-200/70 bg-white/70 text-zinc-900 shadow-[0_10px_40px_-28px_rgba(0,0,0,0.4)] " +
  "dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:shadow-none";

const SURFACE_SOFT =
  "rounded-[28px] sm:rounded-[24px] border p-3 sm:p-4 backdrop-blur " +
  "border-zinc-200/70 bg-white/60 text-zinc-900 " +
  "dark:border-white/10 dark:bg-white/5 dark:text-zinc-50";

const BTN_GHOST =
  "rounded-2xl border px-4 py-2 transition " +
  "border-zinc-200/70 bg-white/70 hover:bg-white " +
  "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10";

const MUTED = "text-zinc-600 dark:text-zinc-300";
const MUTED2 = "text-zinc-500 dark:text-zinc-400";

export default function BudgetsPage() {
  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [viewMode, setViewMode] = useState<"table" | "list">("table");

  const [editOpen, setEditOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<{ id: string; category: string; monthly_limit: number } | null>(
    null
  );

  const [category, setCategory] = useState(CATEGORIES[0].name);
  const [monthlyLimit, setMonthlyLimit] = useState("");

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

  const fetchAll = async () => {
    setLoading(true);
    setErrorMsg("");

    const [bRes, tRes] = await Promise.all([
      supabase.from("budgets").select("*").order("created_at", { ascending: false }),
      supabase
        .from("transactions")
        .select("id,type,amount,category,occurred_on")
        .order("occurred_on", { ascending: false }),
    ]);

    if (bRes.error) setErrorMsg(bRes.error.message);
    if (tRes.error) setErrorMsg((prev) => prev || tRes.error!.message);

    setBudgets((bRes.data ?? []) as Budget[]);
    setTxs((tRes.data ?? []) as Tx[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const onChanged = () => fetchAll();
    window.addEventListener("tx:changed", onChanged);
    return () => window.removeEventListener("tx:changed", onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthTxs = useMemo(
    () => txs.filter((t) => (t.occurred_on ?? "").startsWith(selectedMonth)),
    [txs, selectedMonth]
  );

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of monthTxs) {
      if (t.type !== "expense") continue;
      map.set(t.category, (map.get(t.category) ?? 0) + Number(t.amount));
    }
    return map;
  }, [monthTxs]);

  const monthMeta = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const totalDays = daysInMonth(y, m);
    const now = new Date();

    const isCurrentMonth = monthKey(now) === selectedMonth;
    const dayOfMonth = isCurrentMonth ? now.getDate() : totalDays;
    const daysLeft = isCurrentMonth ? Math.max(0, totalDays - dayOfMonth) : 0;

    return { year: y, month: m, totalDays, dayOfMonth, daysLeft, isCurrentMonth };
  }, [selectedMonth]);

  const addBudget = async () => {
    setErrorMsg("");
    const limit = Number(monthlyLimit);

    if (!monthlyLimit || Number.isNaN(limit) || limit <= 0) {
      setErrorMsg("Enter a monthly limit > 0.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return setErrorMsg("Not logged in.");

    const exists = budgets.some((b) => b.category === category);
    if (exists) return setErrorMsg(`You already have a budget for ${category}. Tap it to edit.`);

    const { error } = await supabase.from("budgets").insert({
      user_id: userId,
      category,
      monthly_limit: limit,
    });

    if (error) return setErrorMsg(error.message);

    setMonthlyLimit("");
    await fetchAll();
  };

  const deleteBudget = async (id: string) => {
    setErrorMsg("");
    const { error } = await supabase.from("budgets").delete().eq("id", id);
    if (error) return setErrorMsg(error.message);
    await fetchAll();
  };

  const rows = useMemo(() => {
    return budgets
      .map((b) => {
        const spent = spentByCategory.get(b.category) ?? 0;
        const limit = Number(b.monthly_limit);
        const remaining = limit - spent;
        const pctRaw = limit > 0 ? spent / limit : 0;
        const pctClamped = clamp(pctRaw, 0, 1);
        const overspent = spent > limit;

        const daysLeft = monthMeta.daysLeft;
        const dailyAllowance = daysLeft > 0 ? Math.max(0, remaining) / daysLeft : Math.max(0, remaining);

        return { ...b, spent, limit, remaining, pctRaw, pctClamped, overspent, dailyAllowance };
      })
      .sort((a, b) => b.pctRaw - a.pctRaw || b.spent - a.spent);
  }, [budgets, spentByCategory, monthMeta.daysLeft]);

  const monthSpendTotal = useMemo(() => {
    return monthTxs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  }, [monthTxs]);

  const monthBudgetTotal = useMemo(() => {
    return budgets.reduce((s, b) => s + Number(b.monthly_limit), 0);
  }, [budgets]);

  const overallPct = useMemo(() => {
    if (monthBudgetTotal <= 0) return null;
    return clamp(monthSpendTotal / monthBudgetTotal, 0, 2);
  }, [monthSpendTotal, monthBudgetTotal]);

  return (
    <div
      className={["relative isolate space-y-6", "animate-[fadeIn_700ms_ease-out]"].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-72 w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-amber-500/15 blur-3xl" />
        <div className="absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-gradient-to-br from-white/10 to-zinc-900/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_60%)]" />
      </div>
      <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-emerald-900/55 via-teal-900/35 to-zinc-900/25 p-4 shadow-[0_20px_60px_-45px_rgba(16,185,129,0.6)] sm:contents">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-300 sm:text-zinc-500 sm:dark:text-zinc-400">Overview</p>
            <h2 className="text-4xl font-bold tracking-tight text-zinc-100 sm:font-semibold sm:text-zinc-900 sm:dark:text-zinc-50">
              Budgets
            </h2>
            <p className="mt-2 text-sm text-zinc-200/90 sm:text-zinc-600 sm:dark:text-zinc-300">
              Set category limits and track month progress.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAll}
              className={[
                BTN_GHOST,
                "border-white/15 bg-white/10 text-zinc-100 hover:bg-white/15",
                "sm:border-zinc-200/70 sm:bg-white/70 sm:text-zinc-900",
                "sm:dark:border-white/10 sm:dark:bg-white/5 sm:dark:text-zinc-50",
              ].join(" ")}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Month selector pills (VISIBLE in light mode) */}
        <div className={`${SURFACE_SOFT} mt-4 animate-[fadeIn_900ms_ease-out] sm:mt-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
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
                      ? "border-white/20 bg-black/45 text-zinc-50 shadow-sm sm:border-zinc-300/80 sm:bg-white sm:text-zinc-900 sm:dark:border-white/20 sm:dark:bg-white/10 sm:dark:text-zinc-50"
                      : "border-white/10 bg-black/30 text-zinc-200 hover:bg-black/40 sm:border-zinc-200/70 sm:bg-white/70 sm:text-zinc-800 sm:hover:bg-white sm:dark:border-white/10 sm:dark:bg-white/5 sm:dark:text-zinc-50 sm:dark:hover:bg-white/10",
                  ].join(" ")}
                >
                  {monthLabel(m)}
                </button>
                );
              })}
            </div>

            <div className={`text-sm ${MUTED}`}>
              {monthMeta.isCurrentMonth ? (
                <>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">{monthMeta.daysLeft}</span> day(s)
                  left • Day {monthMeta.dayOfMonth}/{monthMeta.totalDays}
                </>
              ) : (
                <>Past month snapshot</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Overall status */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className={`${SURFACE} animate-[fadeIn_1000ms_ease-out]`}>
          <p className={`text-sm ${MUTED}`}>Total budget</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {money(monthBudgetTotal)}
          </p>
          <p className={`mt-2 text-sm ${MUTED2}`}>Sum of all category budgets</p>
        </div>

        <div className={`${SURFACE} animate-[fadeIn_1100ms_ease-out]`}>
          <p className={`text-sm ${MUTED}`}>Spent this month</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {money(monthSpendTotal)}
          </p>
          <p className={`mt-2 text-sm ${MUTED2}`}>Only expenses for selected month</p>
        </div>

        <div className={`${SURFACE} animate-[fadeIn_1200ms_ease-out]`}>
          <p className={`text-sm ${MUTED}`}>Overall usage</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {overallPct === null ? "—" : `${Math.round(overallPct * 100)}%`}
          </p>

          <div className="mt-3 h-3 w-full rounded-full overflow-hidden border border-zinc-200/70 bg-zinc-100/60 dark:border-white/10 dark:bg-white/5">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-400"
              style={{
                width: `${overallPct === null ? 0 : Math.round(clamp(overallPct, 0, 1) * 100)}%`,
                background: overallPct !== null && overallPct > 1 ? "#ef4444" : undefined,
              }}
            />
          </div>

          <p className={`mt-2 text-sm ${MUTED2}`}>
            {overallPct === null ? "Add at least one budget to track usage." : "Across all categories"}
          </p>
        </div>
      </div>

      {/* Add budget */}
      <div className={`${SURFACE} animate-[fadeIn_1300ms_ease-out]`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Add budget</h3>
            <p className={`text-sm ${MUTED}`}>Pick a category and set a monthly limit.</p>
          </div>

          <button
            onClick={addBudget}
            className="rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-cyan-500 px-5 py-3 font-semibold text-black shadow-[0_10px_30px_-18px_rgba(16,185,129,0.8)] hover:opacity-90"
          >
            Add
          </button>
        </div>

        {/* Category chips (VISIBLE in light mode) */}
        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const meta = getCategoryMeta(c.name);
            const active = c.name === category;

            return (
              <button
                key={c.name}
                onClick={() => setCategory(c.name)}
                className={[
                  "rounded-full border px-3 py-2 text-sm flex items-center gap-2 transition",
                  active
                    ? meta.chipClass
                    : "border-zinc-200/70 bg-white/70 text-zinc-800 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:hover:bg-white/10",
                ].join(" ")}
              >
                <span>{meta.icon}</span>
                <span>{meta.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className={SURFACE_SOFT}>
            <p className={`text-sm ${MUTED}`}>Monthly limit</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">$</span>
              <input
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full bg-transparent text-3xl font-semibold tabular-nums outline-none placeholder:opacity-30"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[50, 100, 200, 300, 500].map((n) => (
                <button
                  key={n}
                  onClick={() => setMonthlyLimit(String(n))}
                  className="rounded-full border px-3 py-2 text-sm transition border-zinc-200/70 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  {money(n).replace(".00", "")}
                </button>
              ))}
              <button
                onClick={() => setMonthlyLimit("")}
                className="rounded-full border px-3 py-2 text-sm transition border-zinc-200/70 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              >
                Clear
              </button>
            </div>
          </div>

          <div className={SURFACE_SOFT}>
            <p className={`text-sm ${MUTED}`}>Selected</p>
            {(() => {
              const meta = getCategoryMeta(category);
              return (
                <div className="mt-3 space-y-2">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${meta.chipClass}`}>
                    <span>{meta.icon}</span>
                    <span className="font-semibold">{meta.name}</span>
                  </div>
                  <p className={`text-sm ${MUTED}`}>
                    Tip: use “Subscriptions” for repeating bills like Spotify/Netflix.
                  </p>
                </div>
              );
            })()}
          </div>
        </div>

        {errorMsg && <p className="mt-3 text-red-600 dark:text-red-300">{errorMsg}</p>}
      </div>

      {/* Budgets list */}
      <div className={`${SURFACE} animate-[fadeIn_1400ms_ease-out]`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Your budgets</h3>
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

        {loading && <p className={`mt-3 ${MUTED}`}>Loading…</p>}
        {!loading && rows.length === 0 && <p className={`mt-3 ${MUTED}`}>No budgets yet.</p>}

        <div className="mt-4 space-y-3">
          {viewMode === "table" && (
            <div
              className={[
                "hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3",
                "rounded-2xl border px-4 py-3 text-xs uppercase tracking-[0.12em]",
                "border-zinc-200/70 bg-white/70 text-zinc-500",
                "dark:border-white/10 dark:bg-white/5 dark:text-zinc-300",
              ].join(" ")}
            >
              <span>Category</span>
              <span>Spent</span>
              <span>Limit</span>
              <span>Remaining</span>
              <span>Usage</span>
              <span className="text-right">Action</span>
            </div>
          )}

          {rows.map((r) => {
            const meta = getCategoryMeta(r.category);
            const pctLabel = Math.round(r.pctRaw * 100);
            const barWidthPct = Math.round(r.pctClamped * 100);

            const remainingText =
              r.remaining >= 0 ? `Remaining ${money(r.remaining)}` : `Over by ${money(Math.abs(r.remaining))}`;

            return (
              <div
                key={r.id}
                onClick={() => {
                  setEditBudget({ id: r.id, category: r.category, monthly_limit: r.monthly_limit });
                  setEditOpen(true);
                }}
                className={[
                  "cursor-pointer rounded-3xl border p-4 transition hover:-translate-y-0.5",
                  "border-zinc-200/70 bg-white/70 hover:bg-white shadow-[0_10px_30px_-24px_rgba(0,0,0,0.5)]",
                  "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:shadow-none",
                ].join(" ")}
              >
                {viewMode === "table" ? (
                  <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:items-center">
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${meta.chipClass}`}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.name}</span>
                        </span>
                      </div>
                      <p className={`text-sm ${MUTED}`}>
                        {monthMeta.isCurrentMonth
                          ? `On-track cap: ≤ ${money(r.dailyAllowance)}/day for ${monthMeta.daysLeft} day(s)`
                          : "Past month view"}
                      </p>
                    </div>

                    <div className="text-sm tabular-nums">{money(r.spent)}</div>
                    <div className="text-sm tabular-nums">{money(r.limit)}</div>

                    <div
                      className={[
                        "text-sm tabular-nums",
                        r.overspent ? "text-red-600 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300",
                      ].join(" ")}
                    >
                      {remainingText}
                    </div>

                    <div className="text-sm tabular-nums">
                      {Number.isFinite(pctLabel) ? `${pctLabel}% used` : "—"}
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBudget(r.id);
                        }}
                        className={BTN_GHOST}
                        title="Delete budget"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${meta.chipClass}`}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.name}</span>
                        </span>
                        <span className="text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
                          {Number.isFinite(pctLabel) ? `${pctLabel}% used` : "—"}
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBudget(r.id);
                        }}
                        className={BTN_GHOST}
                        title="Delete budget"
                      >
                        🗑️
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className={SURFACE_SOFT}>
                        <p className={`text-xs uppercase tracking-[0.12em] ${MUTED2}`}>Spent</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{money(r.spent)}</p>
                      </div>
                      <div className={SURFACE_SOFT}>
                        <p className={`text-xs uppercase tracking-[0.12em] ${MUTED2}`}>Limit</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{money(r.limit)}</p>
                      </div>
                      <div className={SURFACE_SOFT}>
                        <p className={`text-xs uppercase tracking-[0.12em] ${MUTED2}`}>Remaining</p>
                        <p
                          className={[
                            "mt-1 text-lg font-semibold tabular-nums",
                            r.overspent ? "text-red-600 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300",
                          ].join(" ")}
                        >
                          {remainingText}
                        </p>
                      </div>
                    </div>

                    <p className={`text-sm ${MUTED}`}>
                      {monthMeta.isCurrentMonth
                        ? `On-track cap: ≤ ${money(r.dailyAllowance)}/day for ${monthMeta.daysLeft} day(s)`
                        : "Past month view"}
                    </p>
                  </div>
                )}

                <div className="mt-3 h-3 w-full rounded-full overflow-hidden border border-zinc-200/70 bg-zinc-100/60 dark:border-white/10 dark:bg-white/5">
                  <div
                    className="h-full transition-[width] duration-300 bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-400"
                    style={{
                      width: `${barWidthPct}%`,
                      background: r.overspent ? "#ef4444" : undefined,
                    }}
                  />
                </div>

                {r.overspent && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-300">
                    Overspent. Consider lowering spend in {r.category} or increasing the budget.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Budget Modal */}
      <EditBudgetModal open={editOpen} budget={editBudget} onClose={() => setEditOpen(false)} onUpdated={fetchAll} />
    </div>
  );
}
