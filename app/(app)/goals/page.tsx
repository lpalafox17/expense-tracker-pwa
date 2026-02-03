"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatDateMDY } from "../lib/date";

type Goal = {
  id: string;
  user_id: string;
  title: string;
  target_amount: number;
  saved_amount: number;
  target_date: string | null;
  status: "active" | "completed" | "paused";
  created_at: string;
};

function money(n: number) {
  return `$${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function daysLeft(target?: string | null) {
  if (!target) return null;
  const [y, m, d] = target.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const now = new Date();
  const diff = Math.ceil((dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (!Number.isFinite(diff)) return null;
  return diff;
}

const SURFACE =
  "rounded-[28px] border p-5 backdrop-blur-xl " +
  "border-zinc-200/60 bg-white/70 text-zinc-900 " +
  "shadow-[0_18px_60px_-44px_rgba(15,23,42,0.6)] " +
  "dark:border-white/10 dark:bg-white/6 dark:text-zinc-50 dark:shadow-[0_18px_60px_-44px_rgba(0,0,0,0.6)]";

const INPUT =
  "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition " +
  "border-zinc-200/70 bg-white/70 text-zinc-900 " +
  "focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25 " +
  "dark:border-white/10 dark:bg-white/5 dark:text-zinc-50";

const BTN =
  "rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 " +
  "px-4 py-2 text-sm font-semibold text-black shadow-[0_12px_30px_-18px_rgba(16,185,129,0.8)] " +
  "hover:opacity-90";

const STAT_CARD =
  "rounded-[24px] border px-4 py-4 " +
  "border-white/20 bg-gradient-to-br from-white/80 via-emerald-50/40 to-transparent " +
  "text-zinc-900 shadow-[0_14px_40px_-30px_rgba(15,23,42,0.7)] " +
  "dark:border-white/10 dark:from-white/10 dark:via-emerald-500/10 dark:to-transparent dark:text-zinc-50";

export default function GoalsPage() {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "table">("list");

  const [title, setTitle] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [savedAmount, setSavedAmount] = useState("");
  const [addMsg, setAddMsg] = useState("");

  const [deltaById, setDeltaById] = useState<Record<string, string>>({});

  const requireUser = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user?.id) {
      setErrorMsg("You must be logged in to view goals.");
      setGoals([]);
      setLoading(false);
      return null;
    }
    return user;
  };

  const fetchGoals = async () => {
    setLoading(true);
    setErrorMsg("");

    const user = await requireUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("goals")
      .select("id,user_id,title,target_amount,saved_amount,target_date,status,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      setGoals([]);
      setLoading(false);
      return;
    }

    setGoals((data ?? []) as Goal[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchGoals();
    const onChanged = () => fetchGoals();
    window.addEventListener("goals:changed", onChanged);
    return () => window.removeEventListener("goals:changed", onChanged);
  }, []);

  const totals = useMemo(() => {
    const active = goals.filter((g) => g.status !== "completed");
    const saved = active.reduce((sum, g) => sum + (g.saved_amount ?? 0), 0);
    const target = active.reduce((sum, g) => sum + (g.target_amount ?? 0), 0);
    return { activeCount: active.length, saved, target };
  }, [goals]);

  const createGoal = async () => {
    setAddMsg("");
    const user = await requireUser();
    if (!user) return;

    const t = title.trim();
    const target = Number(targetAmount);
    const saved = Number(savedAmount || 0);

    if (!t) {
      setAddMsg("Please enter a goal name.");
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setAddMsg("Target amount must be a positive number.");
      return;
    }
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      setAddMsg("Target date must be YYYY-MM-DD.");
      return;
    }

    const { error } = await supabase.from("goals").insert({
      user_id: user.id,
      title: t,
      target_amount: target,
      saved_amount: Number.isFinite(saved) ? saved : 0,
      target_date: targetDate || null,
      status: "active",
    });

    if (error) {
      setAddMsg(error.message);
      return;
    }

    setTitle("");
    setTargetAmount("");
    setTargetDate("");
    setSavedAmount("");
    window.dispatchEvent(new Event("goals:changed"));
  };

  const addProgress = async (goal: Goal) => {
    const raw = deltaById[goal.id] ?? "";
    const delta = Number(raw);
    if (!Number.isFinite(delta) || delta <= 0) return;

    const newSaved = Math.max(0, (goal.saved_amount ?? 0) + delta);
    const status = newSaved >= goal.target_amount ? "completed" : goal.status;

    const { error } = await supabase
      .from("goals")
      .update({ saved_amount: newSaved, status })
      .eq("id", goal.id);

    if (!error) {
      setDeltaById((d) => ({ ...d, [goal.id]: "" }));
      window.dispatchEvent(new Event("goals:changed"));
    }
  };

  const markCompleted = async (goal: Goal) => {
    const { error } = await supabase.from("goals").update({ status: "completed" }).eq("id", goal.id);
    if (!error) window.dispatchEvent(new Event("goals:changed"));
  };

  const deleteGoal = async (goal: Goal) => {
    const { error } = await supabase.from("goals").delete().eq("id", goal.id);
    if (!error) window.dispatchEvent(new Event("goals:changed"));
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
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Goals</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Track savings targets and progress over time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("list")}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              viewMode === "list"
                ? "bg-emerald-500 text-black"
                : "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
            ].join(" ")}
          >
            List view
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              viewMode === "table"
                ? "bg-emerald-500 text-black"
                : "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
            ].join(" ")}
          >
            Table view
          </button>
        </div>
      </div>

      <div className={`${SURFACE} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-amber-500/10" />
        <div className="relative grid gap-4 md:grid-cols-4">
          <div className={STAT_CARD}>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-300">Active goals</p>
            <p className="mt-2 text-2xl font-semibold">{totals.activeCount}</p>
          </div>
          <div className={STAT_CARD}>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-300">Saved</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-500">{money(totals.saved)}</p>
          </div>
          <div className={STAT_CARD}>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-300">Target</p>
            <p className="mt-2 text-2xl font-semibold">{money(totals.target)}</p>
          </div>
          <div className={STAT_CARD}>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-300">Progress</p>
            <p className="mt-2 text-2xl font-semibold">
              {totals.target > 0 ? Math.round((totals.saved / totals.target) * 100) : 0}%
            </p>
          </div>
        </div>
      </div>

      <div className={`${SURFACE} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 via-transparent to-cyan-500/10" />
        <div className="relative">
        <p className="text-sm font-semibold">Create a goal</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Goal name (e.g., Emergency fund)"
            className={INPUT}
          />
          <input
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="Target amount"
            className={INPUT}
            inputMode="decimal"
          />
          <input
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            placeholder="Target date (YYYY-MM-DD)"
            className={INPUT}
          />
          <input
            value={savedAmount}
            onChange={(e) => setSavedAmount(e.target.value)}
            placeholder="Starting saved (optional)"
            className={INPUT}
            inputMode="decimal"
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={createGoal} className={BTN}>
            Add goal
          </button>
          {addMsg && <p className="text-sm text-emerald-500">{addMsg}</p>}
        </div>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className={`${SURFACE} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left">Goal</th>
                  <th className="px-4 py-3 text-left">Target</th>
                  <th className="px-4 py-3 text-left">Saved</th>
                  <th className="px-4 py-3 text-left">Due</th>
                  <th className="px-4 py-3 text-left">Progress</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {loading && (
                  <tr>
                    <td className="px-4 py-4 opacity-70" colSpan={6}>
                      Loading goals…
                    </td>
                  </tr>
                )}
                {errorMsg && !loading && (
                  <tr>
                    <td className="px-4 py-4 text-red-400" colSpan={6}>
                      {errorMsg}
                    </td>
                  </tr>
                )}
                {!loading && !errorMsg && goals.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 opacity-70" colSpan={6}>
                      No goals yet. Add your first goal above.
                    </td>
                  </tr>
                )}
                {goals.map((goal) => {
                  const pct = goal.target_amount > 0 ? Math.min(100, (goal.saved_amount / goal.target_amount) * 100) : 0;
                  const days = daysLeft(goal.target_date);
                  return (
                    <tr key={goal.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-semibold">{goal.title}</td>
                      <td className="px-4 py-3">{money(goal.target_amount)}</td>
                      <td className="px-4 py-3 text-emerald-400">{money(goal.saved_amount)}</td>
                      <td className="px-4 py-3">
                        {goal.target_date ? formatDateMDY(goal.target_date) : "—"}
                        {days !== null ? ` • ${days}d` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-white/10">
                            <div
                              className="h-2 rounded-full bg-emerald-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs">{Math.round(pct)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {goal.status !== "completed" && (
                            <button
                              onClick={() => markCompleted(goal)}
                              className="rounded-2xl border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10"
                            >
                              Mark complete
                            </button>
                          )}
                          <button
                            onClick={() => deleteGoal(goal)}
                            className="rounded-2xl border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
        {loading && <p className="opacity-70">Loading goals…</p>}
        {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
        {!loading && goals.length === 0 && (
          <div className={`${SURFACE} text-sm opacity-70`}>No goals yet. Add your first goal above.</div>
        )}

        {goals.map((goal) => {
          const pct = goal.target_amount > 0 ? Math.min(100, (goal.saved_amount / goal.target_amount) * 100) : 0;
          const days = daysLeft(goal.target_date);
          return (
            <div
              key={goal.id}
              className={`${SURFACE} relative overflow-hidden`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-emerald-500/10 dark:from-white/5" />
              <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{goal.title}</p>
                  <p className="text-sm opacity-70">
                    Target {money(goal.target_amount)}
                    {goal.target_date ? ` • Due ${formatDateMDY(goal.target_date)}` : ""}
                    {days !== null ? ` • ${days} days left` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {goal.status !== "completed" && (
                    <button
                      onClick={() => markCompleted(goal)}
                      className="rounded-2xl border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10"
                    >
                      Mark complete
                    </button>
                  )}
                  <button
                    onClick={() => deleteGoal(goal)}
                    className="rounded-2xl border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs opacity-70">
                  <span>Saved {money(goal.saved_amount)}</span>
                  <span>{Math.round(pct)}%</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {goal.status !== "completed" && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    value={deltaById[goal.id] ?? ""}
                    onChange={(e) => setDeltaById((d) => ({ ...d, [goal.id]: e.target.value }))}
                    placeholder="Add progress amount"
                    className={INPUT}
                    inputMode="decimal"
                  />
                  <button onClick={() => addProgress(goal)} className={BTN}>
                    Add progress
                  </button>
                </div>
              )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
