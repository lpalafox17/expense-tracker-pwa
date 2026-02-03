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
      "dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-200",
    dotClass: "bg-emerald-500 dark:bg-emerald-400",
  },
  {
    name: "Dining",
    icon: "🍔",
    chipClass:
      "border-amber-200 bg-amber-50 text-amber-800 " +
      "dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200",
    dotClass: "bg-amber-500 dark:bg-amber-400",
  },
  {
    name: "Gas",
    icon: "⛽",
    chipClass:
      "border-sky-200 bg-sky-50 text-sky-800 " +
      "dark:border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-200",
    dotClass: "bg-sky-500 dark:bg-sky-400",
  },
  {
    name: "Rent",
    icon: "🏠",
    chipClass:
      "border-violet-200 bg-violet-50 text-violet-800 " +
      "dark:border-violet-500/20 dark:bg-violet-500/15 dark:text-violet-200",
    dotClass: "bg-violet-500 dark:bg-violet-400",
  },
  {
    name: "Utilities",
    icon: "💡",
    chipClass:
      "border-yellow-200 bg-yellow-50 text-yellow-900 " +
      "dark:border-yellow-500/20 dark:bg-yellow-500/15 dark:text-yellow-200",
    dotClass: "bg-yellow-500 dark:bg-yellow-400",
  },
  {
    name: "Subscriptions",
    icon: "📦",
    chipClass:
      "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 " +
      "dark:border-fuchsia-500/20 dark:bg-fuchsia-500/15 dark:text-fuchsia-200",
    dotClass: "bg-fuchsia-500 dark:bg-fuchsia-400",
  },
  {
    name: "Shopping",
    icon: "🛍️",
    chipClass:
      "border-pink-200 bg-pink-50 text-pink-800 " +
      "dark:border-pink-500/20 dark:bg-pink-500/15 dark:text-pink-200",
    dotClass: "bg-pink-500 dark:bg-pink-400",
  },
  {
    name: "Health",
    icon: "🏥",
    chipClass:
      "border-red-200 bg-red-50 text-red-800 " +
      "dark:border-red-500/20 dark:bg-red-500/15 dark:text-red-200",
    dotClass: "bg-red-500 dark:bg-red-400",
  },
  {
    name: "Travel",
    icon: "✈️",
    chipClass:
      "border-cyan-200 bg-cyan-50 text-cyan-800 " +
      "dark:border-cyan-500/20 dark:bg-cyan-500/15 dark:text-cyan-200",
    dotClass: "bg-cyan-500 dark:bg-cyan-400",
  },
  {
    name: "Other",
    icon: "🧾",
    chipClass:
      "border-zinc-200 bg-zinc-50 text-zinc-800 " +
      "dark:border-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-200",
    dotClass: "bg-zinc-500 dark:bg-zinc-400",
  },
];

export function getCategoryMeta(name: string): CategoryMeta {
  if (name === "Income") {
    return {
      name,
      icon: "💵",
      chipClass:
        "border-emerald-200 bg-emerald-50 text-emerald-800 " +
        "dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-200",
      dotClass: "bg-emerald-500 dark:bg-emerald-400",
    };
  }

  return (
    CATEGORIES.find((c) => c.name === name) ?? {
      name,
      icon: "🧾",
      chipClass:
        "border-zinc-200 bg-zinc-50 text-zinc-800 " +
        "dark:border-zinc-500/20 dark:bg-zinc-500/15 dark:text-zinc-200",
      dotClass: "bg-zinc-500 dark:bg-zinc-400",
    }
  );
}

export function categoryOptions() {
  return CATEGORIES.map((c) => ({ value: c.name, label: `${c.icon} ${c.name}` }));
}
