"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCategoryMeta } from "../lib/categories";

type Budget = {
  id: string;
  category: string;
  monthly_limit: number;
};

export default function EditBudgetModal({
  open,
  budget,
  onClose,
  onUpdated,
}: {
  open: boolean;
  budget: Budget | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [limit, setLimit] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClosing(false);
    setErr("");
    setSaving(false);
    setLimit(budget ? String(budget.monthly_limit ?? "") : "");
  }, [open, budget]);

  const meta = useMemo(() => getCategoryMeta(budget?.category ?? "Other"), [budget]);

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
    if (!budget) return;
    setErr("");

    const n = Number(limit);
    if (!limit || Number.isNaN(n) || n <= 0) {
      setErr("Enter a monthly limit > 0.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("budgets").update({ monthly_limit: n }).eq("id", budget.id);
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
  }, [open, limit, saving, budget]);

  if (!open || !budget) return null;

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Edit budget</p>

            {/* Category chip */}
            <div
              className={[
                "mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm",
                meta.chipClass,
              ].join(" ")}
            >
              <span>{meta.icon}</span>
              <span className="font-semibold">{meta.name}</span>
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

        {/* Input card */}
        <div
          className={[
            "mt-5 rounded-3xl border p-4",
            "border-zinc-200 bg-zinc-50",
            "dark:border-white/10 dark:bg-white/5",
          ].join(" ")}
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Monthly limit</p>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums">$</span>
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:opacity-30"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {[50, 100, 200, 300, 500, 1000].map((n) => (
              <button
                key={n}
                onClick={() => setLimit(String(n))}
                className={[
                  "rounded-full px-3 py-2 text-sm transition border",
                  "border-zinc-200 bg-white hover:bg-zinc-100",
                  "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                ].join(" ")}
              >
                ${n}
              </button>
            ))}
          </div>

          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Tip: press <span className="font-medium">Ctrl/⌘ + Enter</span> to save.
          </p>

          {err && <p className="mt-3 text-red-600 dark:text-red-300">{err}</p>}
        </div>

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

      {/* Keyframes (kept local so you don’t need to touch tailwind.config) */}
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