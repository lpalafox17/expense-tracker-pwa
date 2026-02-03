"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BTN_GHOST, INPUT, MUTED, PANEL_SOFT } from "../subscriptions/lib/ui";

function monthKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function defaultDateForMonth(selectedMonth: string) {
  const now = new Date();
  const nowKey = monthKey(now);
  if (nowKey === selectedMonth) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return `${selectedMonth}-01`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  defaultMonth: string;
  onAdded?: (occurredOn: string) => void; // optional
};

export default function AddSubscriptionModal({ open, onClose, defaultMonth, onAdded }: Props) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(defaultDateForMonth(defaultMonth));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const openState = open; // readability

  useEffect(() => {
    if (!openState) return;
    setName("");
    setAmount("");
    setErr("");
    setSaving(false);
    setOccurredOn(defaultDateForMonth(defaultMonth));
  }, [openState, defaultMonth]);

  const monthChip = useMemo(() => occurredOn.slice(0, 7), [occurredOn]);

  const close = () => {
    if (saving) return;
    onClose();
  };

  const add = async () => {
    setErr("");
    const amt = Number(amount);

    if (!name.trim()) return setErr("Enter a subscription name (e.g., Netflix).");
    if (!amount || Number.isNaN(amt) || amt <= 0) return setErr("Enter a valid amount > 0.");
    if (!occurredOn) return setErr("Pick a date.");

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return setErr("Not logged in.");

    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      type: "expense",
      amount: amt,
      category: "Subscriptions",
      note: name.trim(),
      occurred_on: occurredOn,
    });
    setSaving(false);

    if (error) return setErr(error.message);

    window.dispatchEvent(new Event("tx:changed"));

    // Let the page jump to the correct month (ex: Feb 2026)
    onAdded?.(occurredOn);
    onClose();
  };

  if (!openState) return null;

  return (
    <div
      className={[
        "fixed inset-0 z-50 flex items-end md:items-center justify-center p-3",
        "bg-black/40 backdrop-blur-sm",
      ].join(" ")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={[
          "w-full md:max-w-xl",
          "rounded-t-3xl md:rounded-3xl border shadow-2xl",
          "bg-white text-zinc-900 border-zinc-200",
          "dark:bg-zinc-950 dark:text-zinc-50 dark:border-white/10",
        ].join(" ")}
      >
        {/* Top bar */}
        <div className="p-5 pb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`text-sm ${MUTED}`}>Add subscription</p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm
                               border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800
                               dark:border-fuchsia-500/20 dark:bg-fuchsia-500/15 dark:text-fuchsia-200">
                <span>🔁</span>
                <span className="font-semibold">Subscriptions</span>
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm
                               border-zinc-200 bg-white text-zinc-700
                               dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                <span className="opacity-70">Month</span>
                <span className="font-semibold tabular-nums">{monthChip}</span>
              </span>
            </div>
          </div>

          <button onClick={close} className={BTN_GHOST} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Name */}
            <div className={PANEL_SOFT}>
              <p className={`text-sm ${MUTED}`}>Name</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Netflix, iCloud, Gym..."
                className={`mt-2 ${INPUT}`}
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {["Netflix", "Spotify", "iCloud", "Gym", "YouTube Premium", "Prime", "Disney+"].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setName(preset)}
                    className="rounded-full border px-3 py-2 text-sm transition
                               border-zinc-200 bg-white hover:bg-zinc-100
                               dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    type="button"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div className={PANEL_SOFT}>
              <p className={`text-sm ${MUTED}`}>Amount</p>

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

              <div className="mt-3 flex flex-wrap gap-2">
                {[5, 10, 15, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    onClick={() => setAmount(String(n))}
                    className="rounded-full border px-3 py-2 text-sm transition
                               border-zinc-200 bg-white hover:bg-zinc-100
                               dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    type="button"
                  >
                    +${n}
                  </button>
                ))}
                <button
                  onClick={() => setAmount("")}
                  className="rounded-full border px-3 py-2 text-sm transition
                             border-zinc-200 bg-white hover:bg-zinc-100
                             dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  type="button"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Date */}
          <div className={PANEL_SOFT}>
            <p className={`text-sm ${MUTED}`}>Date</p>
            <input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className={`mt-2 ${INPUT}`}
            />
          </div>

          {err && <p className="text-sm text-red-600 dark:text-red-300">{err}</p>}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button onClick={close} className={BTN_GHOST} type="button">
              Cancel
            </button>
            <button
              onClick={add}
              disabled={saving}
              className="rounded-2xl bg-emerald-500 px-5 py-2 font-semibold text-black hover:opacity-90 disabled:opacity-60"
              type="button"
            >
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}