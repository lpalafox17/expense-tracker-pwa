"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { matchRecurringForTransaction } from "../lib/recurring";
import { CATEGORIES, getCategoryMeta } from "../lib/categories";
import ReceiptScanModal from "./ReceiptScanModal";
import { assertDateIsInCurrentMonth, currentMonthKey, firstDayOfMonthISO, isDateInMonth } from "../lib/monthLock";

type TxType = "expense" | "income";
const INCOME_CATEGORY = "Income";
const DEFAULT_INCOME_ACCOUNTS = ["Debit Card 1", "Debit Card 2"];
const DEFAULT_INCOME_SOURCES = ["Paycheck", "Transfer", "Refund", "Cash", "Other"];

function readIncomePrefs(): { incomeAccounts: string[]; incomeSources: string[] } {
  if (typeof window === "undefined") {
    return { incomeAccounts: DEFAULT_INCOME_ACCOUNTS, incomeSources: DEFAULT_INCOME_SOURCES };
  }
  try {
    const raw = window.localStorage.getItem("prefs");
    if (!raw) return { incomeAccounts: DEFAULT_INCOME_ACCOUNTS, incomeSources: DEFAULT_INCOME_SOURCES };
    const parsed = JSON.parse(raw) as Partial<{ incomeAccounts: string[]; incomeSources: string[] }>;
    const incomeAccountsRaw = parsed.incomeAccounts?.filter(Boolean) ?? [];
    const incomeSourcesRaw = parsed.incomeSources?.filter(Boolean) ?? [];
    const incomeAccounts = incomeAccountsRaw.length ? incomeAccountsRaw : DEFAULT_INCOME_ACCOUNTS;
    const incomeSources = incomeSourcesRaw.length ? incomeSourcesRaw : DEFAULT_INCOME_SOURCES;
    return { incomeAccounts, incomeSources };
  } catch {
    return { incomeAccounts: DEFAULT_INCOME_ACCOUNTS, incomeSources: DEFAULT_INCOME_SOURCES };
  }
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AddTransactionModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].name);
  const [note, setNote] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [incomeAccounts, setIncomeAccounts] = useState<string[]>(DEFAULT_INCOME_ACCOUNTS);
  const [incomeSources, setIncomeSources] = useState<string[]>(DEFAULT_INCOME_SOURCES);
  const [incomeAccount, setIncomeAccount] = useState(DEFAULT_INCOME_ACCOUNTS[0]);
  const [incomeSource, setIncomeSource] = useState(DEFAULT_INCOME_SOURCES[0]);

  const meta = useMemo(() => getCategoryMeta(category), [category]);
  const quickAmounts = [5, 10, 25, 50, 100];

  // Reset when opening
  useEffect(() => {
    if (!open) return;
    setClosing(false);
    setScanOpen(false);
    setSaving(false);
    setErrorMsg("");
    const prefs = readIncomePrefs();
    setIncomeAccounts(prefs.incomeAccounts);
    setIncomeSources(prefs.incomeSources);
    setIncomeAccount((prev) => (prefs.incomeAccounts.includes(prev) ? prev : prefs.incomeAccounts[0]));
    setIncomeSource((prev) => (prefs.incomeSources.includes(prev) ? prev : prefs.incomeSources[0]));
  }, [open]);

  const reset = () => {
    setType("expense");
    setAmount("");
    setCategory(CATEGORIES[0].name);
    setNote("");
    setOccurredOn(todayISO());
    setErrorMsg("");
    setIncomeAccount(DEFAULT_INCOME_ACCOUNTS[0]);
    setIncomeSource(DEFAULT_INCOME_SOURCES[0]);
  };

  const closeWithAnim = () => {
    if (saving) return;
    setErrorMsg("");
    setClosing(true);
    window.setTimeout(() => {
      onClose();
      setClosing(false);
    }, 180);
  };

  const add = async () => {
    setErrorMsg("");
    const amt = Number(amount);

    if (!amount || Number.isNaN(amt) || amt <= 0) {
      setErrorMsg("Enter a valid amount > 0.");
      return;
    }

    const lock = assertDateIsInCurrentMonth(occurredOn);
    if (!lock.ok) {
      setErrorMsg(lock.message);
      return;
    }

    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (!userId) {
      setErrorMsg("Not logged in.");
      setSaving(false);
      return;
    }

    const noteValue =
      type === "income"
        ? [incomeAccount ? `Account: ${incomeAccount}` : "", incomeSource ? `Source: ${incomeSource}` : "", note.trim()]
            .filter(Boolean)
            .join(" • ")
        : note.trim();

    let recurringIds: { subscription_id?: string; recurring_bill_id?: string } = {};
    if (type === "expense") {
      recurringIds = await matchRecurringForTransaction({
        userId,
        occurredOn: occurredOn,
        note: noteValue ? noteValue : "",
        amount: amt,
        category,
      });
    }

    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      type,
      amount: amt,
      category,
      note: noteValue ? noteValue : null,
      occurred_on: occurredOn,
      ...recurringIds,
    });

    if (error) {
      console.error(error);
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    window.dispatchEvent(new Event("tx:changed"));
    setSaving(false);
    reset();
    closeWithAnim();
  };

  // ESC close, Ctrl/Cmd+Enter save
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWithAnim();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, amount, category, note, occurredOn, type, saving]);

  useEffect(() => {
    if (type === "income") {
      setCategory(INCOME_CATEGORY);
    } else if (category === INCOME_CATEGORY) {
      setCategory(CATEGORIES[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  if (!open) return null;

  return (
    <>
    <div
      className={[
        "fixed inset-0 z-50 flex items-end md:items-center justify-center p-3",
        // overlay
        "bg-black/40 backdrop-blur-sm",
        closing ? "animate-[fadeOut_180ms_ease-in]" : "animate-[fadeIn_160ms_ease-out]",
      ].join(" ")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeWithAnim();
      }}
    >
      <div
        className={[
          "w-full md:max-w-2xl",
          "rounded-t-3xl md:rounded-3xl",
          "border shadow-2xl",
          // light/dark surface
          "bg-white text-zinc-900 border-zinc-200",
          "dark:bg-zinc-950 dark:text-zinc-50 dark:border-white/10",
          "p-5",
          closing
            ? "animate-[modalOut_180ms_ease-in]"
            : "animate-[modalIn_220ms_cubic-bezier(0.2,0.8,0.2,1)]",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold tracking-tight">Add transaction</h3>

            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300 flex flex-wrap items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${meta.dotClass}`} />
              <span className="inline-flex items-center gap-2">
                <span>{meta.icon}</span>
                <span className="font-medium">{meta.name}</span>
              </span>
              <span className="opacity-50">•</span>
              <span className="tabular-nums opacity-80">{occurredOn}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setScanOpen(true)}
              disabled={saving || type !== "expense"}
              className={[
                "rounded-2xl px-3 py-2 text-sm font-semibold transition",
                "border border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
                "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                saving || type !== "expense" ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
              title={type !== "expense" ? "Receipt scan is for expenses" : "Scan a receipt photo"}
            >
              Scan receipt
            </button>

            <button
              onClick={closeWithAnim}
              className={[
                "rounded-2xl px-3 py-2 transition",
                "border border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
                "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
              ].join(" ")}
              title="Close"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Segmented control */}
        <div
          className={[
            "mt-4 flex gap-2 rounded-2xl p-1 border",
            "border-zinc-200 bg-zinc-50",
            "dark:border-white/10 dark:bg-white/5",
          ].join(" ")}
        >
          <button
            onClick={() => setType("expense")}
            className={[
              "flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition",
              type === "expense"
                ? "bg-white shadow-sm border border-zinc-200 dark:bg-white/10 dark:border-white/10"
                : "opacity-70 hover:opacity-100",
            ].join(" ")}
          >
            Expense
          </button>
          <button
            onClick={() => setType("income")}
            className={[
              "flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition",
              type === "income"
                ? "bg-white shadow-sm border border-zinc-200 dark:bg-white/10 dark:border-white/10"
                : "opacity-70 hover:opacity-100",
            ].join(" ")}
          >
            Income
          </button>
        </div>

        {/* Amount */}
        <div
          className={[
            "mt-4 rounded-3xl border p-4",
            "border-zinc-200 bg-zinc-50",
            "dark:border-white/10 dark:bg-white/5",
          ].join(" ")}
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Amount</p>

          <div className="mt-2 flex items-center gap-3">
            <div className="text-3xl font-bold tabular-nums">$</div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className={[
                "w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:opacity-30",
              ].join(" ")}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {quickAmounts.map((q) => (
              <button
                key={q}
                onClick={() => {
                  const current = Number(amount || "0");
                  const next = current + q;
                  setAmount(next.toFixed(2));
                }}
                className={[
                  "rounded-full px-3 py-2 text-sm transition border",
                  "border-zinc-200 bg-white hover:bg-zinc-100",
                  "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                ].join(" ")}
              >
                +${q}
              </button>
            ))}
            <button
              onClick={() => setAmount("")}
              className={[
                "rounded-full px-3 py-2 text-sm transition border",
                "border-zinc-200 bg-white hover:bg-zinc-100",
                "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
              ].join(" ")}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Category + details */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {type === "income" ? (
            <div
              className={[
                "rounded-3xl border p-4",
                "border-zinc-200 bg-zinc-50",
                "dark:border-white/10 dark:bg-white/5",
              ].join(" ")}
            >
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Income details</p>

              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Account</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {incomeAccounts.map((a) => {
                      const active = a === incomeAccount;
                      return (
                        <button
                          key={a}
                          onClick={() => setIncomeAccount(a)}
                          className={[
                            "rounded-full border px-3 py-2 text-sm transition",
                            active
                              ? "border-zinc-300 bg-white text-zinc-900 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-zinc-50"
                              : "border-zinc-200 bg-white hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                          ].join(" ")}
                        >
                          {a}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Source</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {incomeSources.map((s) => {
                      const active = s === incomeSource;
                      return (
                        <button
                          key={s}
                          onClick={() => setIncomeSource(s)}
                          className={[
                            "rounded-full border px-3 py-2 text-sm transition",
                            active
                              ? "border-zinc-300 bg-white text-zinc-900 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-zinc-50"
                              : "border-zinc-200 bg-white hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                          ].join(" ")}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={[
                "rounded-3xl border p-4",
                "border-zinc-200 bg-zinc-50",
                "dark:border-white/10 dark:bg-white/5",
              ].join(" ")}
            >
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Category</p>
              <div className="mt-3 -mx-1 flex flex-wrap content-start gap-2 px-1 pb-2 max-h-36 overflow-y-auto sm:max-h-40">
                {CATEGORIES.map((c) => {
                  const m = getCategoryMeta(c.name);
                  const selected = c.name === category;
                  return (
                    <button
                      key={c.name}
                      onClick={() => setCategory(c.name)}
                      className={[
                        "rounded-full border px-3 py-2 text-sm flex items-center gap-2 transition",
                        selected
                          ? m.chipClass
                          : "border-zinc-200 bg-white hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                      ].join(" ")}
                    >
                      <span>{m.icon}</span>
                      <span>{m.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div
            className={[
              "rounded-3xl border p-4",
              "border-zinc-200 bg-zinc-50",
              "dark:border-white/10 dark:bg-white/5",
            ].join(" ")}
          >
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Details</p>

            <div className="mt-3 space-y-3">
              <input
                type="date"
                value={occurredOn}
                min={firstDayOfMonthISO(currentMonthKey())}
                onChange={(e) => {
                  const next = e.target.value;
                  if (!next) return;
                  const cur = currentMonthKey();
                  if (!isDateInMonth(next, cur)) {
                    setErrorMsg(`Locked: pick a date in ${cur}.`);
                    return;
                  }
                  setErrorMsg("");
                  setOccurredOn(next);
                }}
                className={[
                  "w-full rounded-2xl border px-3 py-2 outline-none transition",
                  "border-zinc-200 bg-white hover:bg-zinc-100 focus:ring-2 focus:ring-emerald-500/30",
                  "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                ].join(" ")}
              />

              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (merchant, reason, etc.)"
                className={[
                  "w-full rounded-2xl border px-3 py-2 outline-none transition placeholder:opacity-50",
                  "border-zinc-200 bg-white hover:bg-zinc-100 focus:ring-2 focus:ring-emerald-500/30",
                  "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                ].join(" ")}
              />

              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Tip: press <span className="font-medium">Ctrl/⌘ + Enter</span> to save.
              </p>
            </div>
          </div>
        </div>

        {errorMsg && <p className="mt-3 text-red-600 dark:text-red-300">{errorMsg}</p>}

        {/* Actions */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={add}
            disabled={saving}
            className={[
              "flex-1 rounded-2xl px-5 py-3 font-semibold transition",
              "bg-emerald-500 text-black hover:opacity-90 disabled:opacity-50",
            ].join(" ")}
          >
            {saving ? "Saving…" : "Add transaction"}
          </button>

          <button
            onClick={closeWithAnim}
            disabled={saving}
            className={[
              "rounded-2xl px-5 py-3 transition border",
              "border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-50",
              "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
            ].join(" ")}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Animations (Tailwind arbitrary keyframes need these defined in CSS if you don't have them yet) */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes modalOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
        }
      `}</style>
    </div>
    {scanOpen ? (
      <ReceiptScanModal
        onClose={() => setScanOpen(false)}
        onApply={(r) => {
          if (typeof r.total === "number" && Number.isFinite(r.total) && r.total > 0) {
            setAmount(r.total.toFixed(2));
          }
          if (typeof r.occurred_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.occurred_on)) {
            const cur = currentMonthKey();
            if (isDateInMonth(r.occurred_on, cur)) {
              setOccurredOn(r.occurred_on);
            }
          }
          if (typeof r.category === "string" && r.category) {
            setCategory(r.category);
          }

          const noteParts = [r.merchant, r.note].filter((x): x is string => typeof x === "string" && x.trim());
          if (noteParts.length) setNote(noteParts.join(" • ").slice(0, 200));

          setScanOpen(false);
        }}
      />
    ) : null}
    </>
  );
}
