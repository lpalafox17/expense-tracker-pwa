"use client";

import { BTN_GHOST, MUTED } from "../subscriptions/lib/ui";
import { formatDateMDY } from "../lib/date";

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pickBrandEmoji(name: string) {
  const s = (name || "").toLowerCase();
  if (s.includes("netflix")) return "🎬";
  if (s.includes("spotify")) return "🎵";
  if (s.includes("hulu")) return "📺";
  if (s.includes("disney")) return "🏰";
  if (s.includes("apple")) return "🍎";
  if (s.includes("icloud")) return "☁️";
  if (s.includes("google") || s.includes("youtube")) return "▶️";
  if (s.includes("amazon") || s.includes("prime")) return "📦";
  if (s.includes("gym") || s.includes("fitness")) return "💪";
  if (s.includes("xbox") || s.includes("game pass")) return "🎮";
  if (s.includes("adobe")) return "🅰️";
  return "🔁";
}

export default function SubscriptionCard({
  name,
  occurredOn,
  amount,
  total,
  onEdit,
  onDelete,
}: {
  name: string;
  occurredOn: string;
  amount: number;
  total: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const icon = pickBrandEmoji(name);
  const amt = Number(amount);

  const impact = amt >= 50 ? "High" : amt >= 20 ? "Medium" : "Low";

  const impactClass =
    impact === "High"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-200"
      : impact === "Medium"
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
      : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200";

  const fillColor = amt >= 50 ? "#ef4444" : amt >= 20 ? "#f59e0b" : "#22c55e";
  const pct = Math.round(100 * (total > 0 ? clamp(amt / total, 0, 1) : 0));

  return (
    <div
      onClick={onEdit}
      className={[
        "group cursor-pointer rounded-3xl border p-4 transition hover:-translate-y-0.5",
        // light mode
        "border-zinc-200/70 bg-white/70 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.45)] backdrop-blur",
        "hover:bg-white",
        // dark mode
        "dark:border-white/10 dark:bg-white/5 dark:shadow-none",
        "dark:hover:bg-white/10 dark:hover:translate-y-0",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* icon tile */}
          <div
            className={[
              "h-10 w-10 shrink-0 rounded-2xl border flex items-center justify-center text-lg",
              "border-zinc-200 bg-gradient-to-b from-zinc-50 to-white",
              "group-hover:from-zinc-100 group-hover:to-white",
              "dark:border-white/10 dark:from-white/5 dark:to-white/5 dark:bg-white/5",
            ].join(" ")}
          >
            {icon}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-base font-semibold leading-tight truncate text-zinc-900 dark:text-zinc-50">
                {name}
              </p>
            </div>

            <p className={`mt-1 text-sm ${MUTED}`}>
              {formatDateMDY(occurredOn)} •{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{money(amt)}</span>{" "}
              <span className="opacity-70">/ mo</span>
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${impactClass}`}>
                {impact} impact
              </span>

              <span className="rounded-full border px-3 py-1 text-xs font-medium border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                Annual: {money(amt * 12)}
              </span>

              <span className="rounded-full border px-3 py-1 text-xs font-medium border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                Active
              </span>
            </div>
          </div>
        </div>

        {/* actions */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {pct}%
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className={[
              BTN_GHOST,
              "px-3 py-2",
              "hover:scale-[1.02] active:scale-[0.98]",
            ].join(" ")}
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>Share of month</span>
          <span className="tabular-nums">{pct}%</span>
        </div>

        <div className="mt-2 h-2.5 w-full rounded-full overflow-hidden border bg-zinc-100 border-zinc-200 dark:bg-white/5 dark:border-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${pct}%`,
              background: fillColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}
