export type CategoryMeta = {
  name: string;
  icon: string;
  chipClass: string; // used for pills
  dotClass: string;  // small dot color
};

export const CATEGORIES: CategoryMeta[] = [
  {
    name: "Car Payment",
    icon: "🚘",
    chipClass:
      "border-indigo-200 bg-indigo-50 text-indigo-800 " +
      "dark:border-indigo-500/20 dark:bg-indigo-500/15 dark:text-indigo-200",
    dotClass: "bg-indigo-500 dark:bg-indigo-400",
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
    name: "Coffee",
    icon: "☕",
    chipClass:
      "border-orange-200 bg-orange-50 text-orange-800 " +
      "dark:border-orange-500/20 dark:bg-orange-500/15 dark:text-orange-200",
    dotClass: "bg-orange-500 dark:bg-orange-400",
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
    name: "Insurance",
    icon: "🛡️",
    chipClass:
      "border-teal-200 bg-teal-50 text-teal-800 " +
      "dark:border-teal-500/20 dark:bg-teal-500/15 dark:text-teal-200",
    dotClass: "bg-teal-500 dark:bg-teal-400",
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
    name: "Entertainment",
    icon: "🎬",
    chipClass:
      "border-purple-200 bg-purple-50 text-purple-800 " +
      "dark:border-purple-500/20 dark:bg-purple-500/15 dark:text-purple-200",
    dotClass: "bg-purple-500 dark:bg-purple-400",
  },
  {
    name: "Groceries",
    icon: "🛒",
    chipClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800 " +
      "dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-200",
    dotClass: "bg-emerald-500 dark:bg-emerald-400",
  },
  {
    name: "Transit",
    icon: "🚇",
    chipClass:
      "border-cyan-200 bg-cyan-50 text-cyan-800 " +
      "dark:border-cyan-500/20 dark:bg-cyan-500/15 dark:text-cyan-200",
    dotClass: "bg-cyan-500 dark:bg-cyan-400",
  },
  {
    name: "Ride Share",
    icon: "🚕",
    chipClass:
      "border-sky-200 bg-sky-50 text-sky-800 " +
      "dark:border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-200",
    dotClass: "bg-sky-500 dark:bg-sky-400",
  },
  {
    name: "Parking",
    icon: "🅿️",
    chipClass:
      "border-blue-200 bg-blue-50 text-blue-800 " +
      "dark:border-blue-500/20 dark:bg-blue-500/15 dark:text-blue-200",
    dotClass: "bg-blue-500 dark:bg-blue-400",
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
    name: "Electronics",
    icon: "💻",
    chipClass:
      "border-slate-200 bg-slate-50 text-slate-800 " +
      "dark:border-slate-500/20 dark:bg-slate-500/15 dark:text-slate-200",
    dotClass: "bg-slate-500 dark:bg-slate-400",
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
    name: "Fitness",
    icon: "🏋️",
    chipClass:
      "border-lime-200 bg-lime-50 text-lime-800 " +
      "dark:border-lime-500/20 dark:bg-lime-500/15 dark:text-lime-200",
    dotClass: "bg-lime-500 dark:bg-lime-400",
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
    name: "Gifts",
    icon: "🎁",
    chipClass:
      "border-red-200 bg-red-50 text-red-800 " +
      "dark:border-red-500/20 dark:bg-red-500/15 dark:text-red-200",
    dotClass: "bg-red-500 dark:bg-red-400",
  },
  {
    name: "Education",
    icon: "🎓",
    chipClass:
      "border-amber-200 bg-amber-50 text-amber-800 " +
      "dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200",
    dotClass: "bg-amber-500 dark:bg-amber-400",
  },
  {
    name: "Home",
    icon: "🛠️",
    chipClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800 " +
      "dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-200",
    dotClass: "bg-emerald-500 dark:bg-emerald-400",
  },
  {
    name: "Pets",
    icon: "🐾",
    chipClass:
      "border-orange-200 bg-orange-50 text-orange-800 " +
      "dark:border-orange-500/20 dark:bg-orange-500/15 dark:text-orange-200",
    dotClass: "bg-orange-500 dark:bg-orange-400",
  },
  {
    name: "Kids",
    icon: "🧸",
    chipClass:
      "border-pink-200 bg-pink-50 text-pink-800 " +
      "dark:border-pink-500/20 dark:bg-pink-500/15 dark:text-pink-200",
    dotClass: "bg-pink-500 dark:bg-pink-400",
  },
  {
    name: "Savings",
    icon: "💰",
    chipClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800 " +
      "dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-200",
    dotClass: "bg-emerald-500 dark:bg-emerald-400",
  },
  {
    name: "Bars",
    icon: "🍸",
    chipClass:
      "border-rose-200 bg-rose-50 text-rose-800 " +
      "dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200",
    dotClass: "bg-rose-500 dark:bg-rose-400",
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
