"use client";

import { MUTED } from "../subscriptions/lib/ui";

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

export default function RecurringCard({
  note,
  amount,
  monthsCount,
  isInThisMonth,
}: {
  note: string;
  amount: number;
  monthsCount: number;
  isInThisMonth: boolean;
}) {
  const icon = pickBrandEmoji(note);
  const chip = isInThisMonth
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200"
    : "border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200";

  return (
    <div className="rounded-3xl border p-4 bg-white border-zinc-200 text-zinc-900 shadow-sm dark:bg-white/5 dark:border-white/10 dark:text-zinc-50 dark:shadow-none">
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-11 w-11 rounded-2xl border flex items-center justify-center text-xl border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-lg font-semibold truncate">{note}</p>
          <p className={`mt-1 text-sm ${MUTED}`}>
            ${amount.toFixed(2)} • seen in {monthsCount} month(s)
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs ${chip}`}>
              {isInThisMonth ? "Logged this month" : "Not logged this month"}
            </span>
            <span className="rounded-full border px-3 py-1 text-xs border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
              Annual: {money(amount * 12)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 w-full rounded-full overflow-hidden border bg-zinc-100 border-zinc-200 dark:bg-white/5 dark:border-white/10">
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${Math.round(100 * clamp(monthsCount / 12, 0, 1))}%`,
            background: "#a855f7",
          }}
        />
      </div>
    </div>
  );
}