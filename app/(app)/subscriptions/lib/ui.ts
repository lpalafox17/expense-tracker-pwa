export type CategoryMeta = {
  name: string;
  icon: string;
  chipClass: string; // used for pills
  dotClass: string;  // small dot color
};

export const CATEGORIES: CategoryMeta[] = [
  {
    name: "Groceries",
    icon: "🛒",
    chipClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800 " +
      "dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/20",
    dotClass: "bg-emerald-400",
  },
  {
    name: "Dining",
    icon: "🍔",
    chipClass:
      "border-amber-200 bg-amber-50 text-amber-800 " +
      "dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/20",
    dotClass: "bg-amber-400",
  },
  {
    name: "Gas",
    icon: "⛽",
    chipClass:
      "border-sky-200 bg-sky-50 text-sky-800 " +
      "dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/20",
    dotClass: "bg-sky-400",
  },
  {
    name: "Rent",
    icon: "🏠",
    chipClass:
      "border-violet-200 bg-violet-50 text-violet-800 " +
      "dark:bg-violet-500/15 dark:text-violet-200 dark:border-violet-500/20",
    dotClass: "bg-violet-400",
  },
  {
    name: "Utilities",
    icon: "💡",
    chipClass:
      "border-yellow-200 bg-yellow-50 text-yellow-800 " +
      "dark:bg-yellow-500/15 dark:text-yellow-200 dark:border-yellow-500/20",
    dotClass: "bg-yellow-400",
  },
  {
    name: "Subscriptions",
    icon: "📦",
    chipClass:
      "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 " +
      "dark:bg-fuchsia-500/15 dark:text-fuchsia-200 dark:border-fuchsia-500/20",
    dotClass: "bg-fuchsia-400",
  },
  {
    name: "Shopping",
    icon: "🛍️",
    chipClass:
      "border-pink-200 bg-pink-50 text-pink-800 " +
      "dark:bg-pink-500/15 dark:text-pink-200 dark:border-pink-500/20",
    dotClass: "bg-pink-400",
  },
  {
    name: "Health",
    icon: "🏥",
    chipClass:
      "border-red-200 bg-red-50 text-red-800 " +
      "dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/20",
    dotClass: "bg-red-400",
  },
  {
    name: "Travel",
    icon: "✈️",
    chipClass:
      "border-cyan-200 bg-cyan-50 text-cyan-800 " +
      "dark:bg-cyan-500/15 dark:text-cyan-200 dark:border-cyan-500/20",
    dotClass: "bg-cyan-400",
  },
  {
    name: "Other",
    icon: "🧾",
    chipClass:
      "border-zinc-200 bg-zinc-50 text-zinc-800 " +
      "dark:bg-zinc-500/15 dark:text-zinc-200 dark:border-zinc-500/20",
    dotClass: "bg-zinc-400",
  },
];

export function getCategoryMeta(name: string): CategoryMeta {
  return (
    CATEGORIES.find((c) => c.name === name) ?? {
      name,
      icon: "🧾",
      chipClass:
        "border-zinc-200 bg-zinc-50 text-zinc-800 " +
        "dark:bg-zinc-500/15 dark:text-zinc-200 dark:border-zinc-500/20",
      dotClass: "bg-zinc-400",
    }
  );
}

export function categoryOptions() {
  return CATEGORIES.map((c) => ({ value: c.name, label: `${c.icon} ${c.name}` }));
}
// app/(app)/subscriptions/lib/ui.ts

export const PANEL =
  "rounded-[32px] sm:rounded-[28px] border p-4 sm:p-5 backdrop-blur-xl " +
  "border-zinc-200/70 bg-white/70 text-zinc-900 shadow-[0_10px_40px_-28px_rgba(0,0,0,0.4)] " +
  "dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:shadow-none";

export const PANEL_SOFT =
  "rounded-[28px] sm:rounded-[24px] border p-3 sm:p-4 backdrop-blur " +
  "border-zinc-200/70 bg-white/60 text-zinc-900 " +
  "dark:border-white/10 dark:bg-white/5 dark:text-zinc-50";

export const BTN_GHOST =
  "rounded-2xl border px-4 py-2 transition " +
  "border-zinc-200/70 bg-white/70 hover:bg-white active:scale-[0.99] " +
  "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10";

export const MUTED = "text-zinc-600 dark:text-zinc-300";
export const MUTED2 = "text-zinc-500 dark:text-zinc-400";

export const INPUT =
  "w-full rounded-2xl border px-3 py-2 outline-none transition " +
  "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-emerald-200 " +
  "dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:ring-emerald-500/20";
