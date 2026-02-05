"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatDateMDY } from "../lib/date";
import { ensureRecurringTransactions } from "../lib/recurring";

type Paycheck = {
  id: string;
  user_id: string;
  amount: number;
  source: string | null;
  pay_date: string;
  created_at: string;
};

type Tx = {
  type: "expense" | "income";
  amount: number;
  occurred_on: string;
};

type Subscription = {
  amount_monthly: number;
  billing_day: number;
};

function money(n: number) {
  return `$${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
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

function isoDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthLabel(d: Date) {
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function buildMonthGrid(view: Date) {
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const daysInMonth = last.getDate();
  const startWeekday = first.getDay(); // 0-6
  const grid: Array<Date | null> = [];
  for (let i = 0; i < startWeekday; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push(new Date(year, month, d));
  }
  return grid;
}

const SURFACE =
  "rounded-[28px] border p-5 backdrop-blur-xl " +
  "border-zinc-200/60 bg-white/70 text-zinc-900 " +
  "shadow-[0_18px_60px_-44px_rgba(15,23,42,0.6)] " +
  "dark:border-white/10 dark:bg-white/6 dark:text-zinc-50 dark:shadow-[0_18px_60px_-44px_rgba(0,0,0,0.6)]";

const INPUT =
  "w-full rounded-xl border px-3 py-2 text-sm outline-none transition " +
  "border-zinc-200/70 bg-white/70 text-zinc-900 " +
  "focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/25 " +
  "dark:border-white/10 dark:bg-white/5 dark:text-zinc-50";

const BTN =
  "rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 " +
  "px-4 py-2 text-sm font-semibold text-black shadow-[0_12px_30px_-18px_rgba(16,185,129,0.8)] " +
  "hover:opacity-90";

function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (value ? new Date(value) : new Date()));
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (value) setView(new Date(value));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const grid = buildMonthGrid(view);
  const selected = value ? new Date(value) : null;
  const today = new Date();

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-zinc-100 hover:bg-white/10"
      >
        {value ? formatDateMDY(value) : "Select date"}
      </button>
      {open && (
        <div className="absolute z-50 bottom-full mb-2 w-64 rounded-2xl border border-white/10 bg-zinc-950/95 p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              className="rounded-lg px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
            >
              ◀
            </button>
            <span className="text-sm font-semibold text-zinc-100">{monthLabel(view)}</span>
            <button
              type="button"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              className="rounded-lg px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
            >
              ▶
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-zinc-400">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={`${d}-${i}`} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((d, i) => {
              if (!d) return <div key={`e-${i}`} className="h-8" />;
              const iso = isoDate(d);
              const selectedDay = selected && isSameDay(d, selected);
              const todayDay = isSameDay(d, today);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={[
                    "h-8 rounded-lg text-xs",
                    selectedDay
                      ? "bg-emerald-500 text-black"
                      : "text-zinc-200 hover:bg-white/10",
                    todayDay && !selectedDay ? "border border-emerald-500/40" : "",
                  ].join(" ")}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IncomePage() {
  const [loading, setLoading] = useState(true);
  const [paychecks, setPaychecks] = useState<Paycheck[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [customSource, setCustomSource] = useState("");
  const [incomeAccounts, setIncomeAccounts] = useState<string[]>([]);
  const [payDate, setPayDate] = useState("");
  const [addMsg, setAddMsg] = useState("");

  const [availableBalance, setAvailableBalance] = useState("");
  const [balanceMsg, setBalanceMsg] = useState("");

  const month = useMemo(() => monthKey(new Date()), []);

  const requireUser = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user?.id) {
      setErrorMsg("You must be logged in to view income.");
      setLoading(false);
      return null;
    }
    return user;
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("prefs");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{ incomeAccounts: string[] }>;
      const accounts = parsed.incomeAccounts?.filter(Boolean) ?? [];
      setIncomeAccounts(accounts);
      if (accounts.length) {
        setSource(accounts[0]);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setErrorMsg("");

    const user = await requireUser();
    if (!user) return;

    const { start, end } = monthRange(month);

    await ensureRecurringTransactions(user.id);

    const [payRes, txRes, balRes, subRes] = await Promise.all([
      supabase
        .from("paychecks")
        .select("id,user_id,amount,source,pay_date,created_at")
        .eq("user_id", user.id)
        .order("pay_date", { ascending: true }),
      supabase
        .from("transactions")
        .select("type,amount,occurred_on")
        .eq("user_id", user.id)
        .gte("occurred_on", start)
        .lt("occurred_on", end),
      supabase
        .from("balances")
        .select("id,user_id,amount,updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("amount_monthly,billing_day")
        .eq("user_id", user.id),
    ]);

    if (payRes.error) {
      setErrorMsg(payRes.error.message);
      setLoading(false);
      return;
    }
    if (txRes.error) {
      setErrorMsg(txRes.error.message);
      setLoading(false);
      return;
    }

    setPaychecks((payRes.data ?? []) as Paycheck[]);
    setTxs((txRes.data ?? []) as Tx[]);
    setSubs((subRes.data ?? []) as Subscription[]);
    if (balRes.data?.amount != null) {
      setAvailableBalance(String(balRes.data.amount));
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const summary = useMemo(() => {
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const balance = Number(availableBalance) || 0;
    return { income, expense, balance, available: income - expense + balance };
  }, [txs, availableBalance]);

  const addPaycheck = async () => {
    setAddMsg("");
    const user = await requireUser();
    if (!user) return;

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setAddMsg("Amount must be a positive number.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
      setAddMsg("Pay date must be YYYY-MM-DD.");
      return;
    }

    const finalSource =
      source === "__custom__" ? customSource.trim() || null : source.trim() || null;

    const { error } = await supabase.from("paychecks").insert({
      user_id: user.id,
      amount: amt,
      source: finalSource,
      pay_date: payDate,
    });

    if (error) {
      setAddMsg(error.message);
      return;
    }

    setAmount("");
    setSource(incomeAccounts[0] ?? "");
    setCustomSource("");
    setPayDate("");
    fetchAll();
  };

  const updateBalance = async () => {
    setBalanceMsg("");
    const user = await requireUser();
    if (!user) return;
    const amt = Number(availableBalance);
    if (!Number.isFinite(amt)) {
      setBalanceMsg("Balance must be a number.");
      return;
    }

    const { data: existing } = await supabase
      .from("balances")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const res = existing?.id
      ? await supabase.from("balances").update({ amount: amt }).eq("id", existing.id)
      : await supabase.from("balances").insert({ user_id: user.id, amount: amt });

    if (res.error) {
      setBalanceMsg(res.error.message);
      return;
    }

    setBalanceMsg("Saved.");
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
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Income</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Track available income and upcoming paychecks.
          </p>
        </div>
      </div>

        <div className={`${SURFACE} grid gap-4 md:grid-cols-3`}>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              Deposits (this month)
            </p>
            <p className="mt-2 text-2xl font-semibold text-emerald-500">
              {money(summary.income)}
            </p>
            <p className="mt-2 text-xs opacity-70">Actual deposits recorded</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">Expenses (this month)</p>
            <p className="mt-2 text-2xl font-semibold">{money(summary.expense)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">Available income</p>
            <p className="mt-2 text-2xl font-semibold">{money(summary.available)}</p>
            <p className="mt-2 text-xs opacity-70">Deposits − expenses + available balance</p>
          </div>
        </div>

      <div className={`${SURFACE}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Available balance</p>
            <p className="text-xs opacity-70">Current available amount in your bank</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs opacity-80">
              {availableBalance ? money(Number(availableBalance)) : "—"}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
            <span className="text-xs opacity-70">$</span>
            <input
              value={availableBalance}
              onChange={(e) => setAvailableBalance(e.target.value)}
              placeholder="0.00"
              className="w-32 bg-transparent text-sm outline-none"
              inputMode="decimal"
            />
          </div>
          <button onClick={updateBalance} className={BTN}>Save</button>
          {balanceMsg && <p className="text-sm text-emerald-500">{balanceMsg}</p>}
        </div>
      </div>


      <div className={`${SURFACE}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Add a paycheck</p>
            <p className="text-xs opacity-70">Manual entry for upcoming income</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
            <span className="text-xs opacity-70">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="w-28 bg-transparent text-sm outline-none"
              inputMode="decimal"
            />
          </div>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={`${INPUT} w-52`}
          >
            {(incomeAccounts.length ? incomeAccounts : ["Primary Account"]).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            <option value="__custom__">Custom source…</option>
          </select>
          {source === "__custom__" && (
            <input
              value={customSource}
              onChange={(e) => setCustomSource(e.target.value)}
              placeholder="Source name"
              className={`${INPUT} w-44`}
            />
          )}
          <DatePicker value={payDate} onChange={setPayDate} />
          <button onClick={addPaycheck} className={BTN}>Add</button>
          {addMsg && <p className="text-sm text-emerald-500">{addMsg}</p>}
        </div>
      </div>

      <div className={`${SURFACE}`}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Upcoming paychecks</p>
          <span className="text-xs opacity-70">{paychecks.length} total</span>
        </div>
        {loading && <p className="mt-3 opacity-70">Loading…</p>}
        {errorMsg && <p className="mt-3 text-sm text-red-500">{errorMsg}</p>}
        {!loading && paychecks.length === 0 && (
          <p className="mt-3 opacity-70">No paychecks logged yet.</p>
        )}
        <div className="mt-3 space-y-2">
          {paychecks.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{p.source || "Paycheck"}</p>
                <p className="text-xs opacity-70">{formatDateMDY(p.pay_date)}</p>
              </div>
              <div className="text-sm font-semibold text-emerald-400">{money(Number(p.amount))}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
