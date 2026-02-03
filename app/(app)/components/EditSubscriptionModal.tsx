"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCategoryMeta } from "../lib/categories";

type SubTx = {
  id: string;
  amount: number;
  note: string | null;
  occurred_on: string;
  category: string;
};

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

export default function EditSubscriptionModal({
  open,
  tx,
  onClose,
  onUpdated,
}: {
  open: boolean;
  tx: SubTx | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setClosing(false);
    setSaving(false);
    setErr("");

    setName((tx?.note ?? "").trim());
    setAmount(tx ? String(tx.amount) : "");
    setOccurredOn(tx?.occurred_on ?? "");
  }, [open, tx]);

  const meta = useMemo(() => getCategoryMeta("Subscriptions"), []);

  const closeWithAnim = () => {
    if (saving) return;
    setErr("");
    setClosing(true);
    window.setTimeout(() => {
      onClose();
      setClosing(false);
    }, 180);
  };

  const save = async () => {
    if (!tx) return;
    setErr("");

    const amt = Number(amount);
    if (!name.trim()) {
      setErr("Enter a name (e.g., Netflix).");
      return;
    }
    if (!amount || Number.isNaN(amt) || amt <= 0) {
      setErr("Enter a valid amount > 0.");
      return;
    }
    if (!occurredOn) {
      setErr("Pick a date.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("transactions")
      .update({
        note: name.trim(),
        amount: amt,
        occurred_on: occurredOn,
        category: "Subscriptions",
        type: "expense",
      })
      .eq("id", tx.id);
    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    onUpdated();
    closeWithAnim();
  };

  // ESC close, Ctrl/Cmd+Enter save
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWithAnim();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, name, amount, occurredOn, saving, tx]);

  if (!open || !tx) return null;

  const annual = money(Number(amount || 0) * 12);

  return (
    <div
      className={[
        "fixed inset-0 z-50 flex items-end md:items-center justify-center p-3",
        "bg-black/40 backdrop-blur-sm",
        closing ? "animate-[fadeOut_180ms_ease-in]" : "animate-[fadeIn_160ms_ease-out]",
      ].join(" ")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeWithAnim();
      }}
    >
      <div
        className={[
          "w-full md:max-w-xl rounded-t-3xl md:rounded-3xl p-5 shadow-2xl border",
          "bg-white text-zinc-900 border-zinc-200",
          "dark:bg-zinc-950 dark:text-zinc-50 dark:border-white/10",
          closing ? "animate-[modalOut_180ms_ease-in]" : "animate-[modalIn_220ms_cubic-bezier(0.2,0.8,0.2,1)]",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Edit subscription</p>
            <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${meta.chipClass}`}>
              <span>{meta.icon}</span>
              <span className="font-semibold">Subscriptions</span>
            </div>
          </div>

          <button
            onClick={closeWithAnim}
            className={[
              "rounded-2xl px-3 py-2 transition border",
              "border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
              "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
            ].join(" ")}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Name</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Netflix, iCloud, Gym..."
              className={[
                "mt-2 w-full rounded-2xl border px-3 py-2 outline-none",
                "border-zinc-200 bg-white placeholder:text-zinc-400",
                "dark:border-white/10 dark:bg-white/5 dark:placeholder:text-zinc-500",
              ].join(" ")}
            />
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Amount</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl font-bold">$</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:opacity-30"
              />
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Annual: {annual}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Tip: press <span className="font-medium">Ctrl/⌘ + Enter</span> to save.
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Date</p>
          <input
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className={[
              "mt-2 w-full rounded-2xl border px-3 py-2 outline-none",
              "border-zinc-200 bg-white",
              "dark:border-white/10 dark:bg-white/5",
            ].join(" ")}
          />
        </div>

        {err && <p className="mt-3 text-red-600 dark:text-red-300">{err}</p>}

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={closeWithAnim}
            disabled={saving}
            className={[
              "rounded-2xl px-4 py-2 transition border",
              "border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-60",
              "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
            ].join(" ")}
          >
            Cancel
          </button>

          <button
            onClick={save}
            disabled={saving}
            className="rounded-2xl bg-emerald-500 px-5 py-2 font-semibold text-black hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* local keyframes so you don't need tailwind config */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes modalOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(10px) scale(0.98); }
        }
      `}</style>
    </div>
  );
}