"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AddTransactionModal from "./components/AddTransactionModal";
import AIAssistant from "./components/AIAssistant";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/transactions", label: "Transactions", icon: "🧾" },
  { href: "/subscriptions", label: "Subscriptions", icon: "🔁" },
  { href: "/budgets", label: "Budgets", icon: "🎯" },
  { href: "/income", label: "Income", icon: "💵" },
  { href: "/goals", label: "Goals", icon: "🏁" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

function titleFromPath(pathname: string) {
  const p = pathname.replace("/", "");
  if (!p) return "Dashboard";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [openAdd, setOpenAdd] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.href = "/login";
      else setChecking(false);
    });
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (checking) {
    return (
      <main className="min-h-screen p-6 bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <p className="opacity-70">Loading…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 transition-colors duration-300">
      {/* Modals / global overlays */}
      <AddTransactionModal open={openAdd} onClose={() => setOpenAdd(false)} />

      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-72 md:flex-col border-r border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight">Expense Tracker</h1>
          <p className="text-sm opacity-70 mt-1">Rocket-style dashboard</p>

          <button
            onClick={() => setOpenAdd(true)}
            className="mt-5 w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-black hover:opacity-90"
          >
            + Add transaction
          </button>
        </div>

        <nav className="px-4 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-2xl px-4 py-3 transition",
                  active
                    ? "bg-zinc-100 dark:bg-white/10"
                    : "hover:bg-zinc-100/70 dark:hover:bg-white/5",
                ].join(" ")}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-6">
          <button
            onClick={logout}
            className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-semibold text-red-600 hover:bg-red-500/15 dark:text-red-200"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="md:ml-72">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-zinc-950/70">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm opacity-70">Overview</p>
              <h2 className="text-xl font-semibold tracking-tight">
                {titleFromPath(pathname)}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {/* Optional: open Add modal */}
              <button
                onClick={() => setOpenAdd(true)}
                className="hidden sm:inline-flex rounded-2xl bg-emerald-500 px-4 py-2 font-semibold text-black hover:opacity-90"
              >
                + Add
              </button>

              <Link
                href="/settings"
                className="h-10 w-10 rounded-full border border-zinc-200 bg-zinc-100 flex items-center justify-center dark:border-white/10 dark:bg-white/10 hover:bg-zinc-200/70 dark:hover:bg-white/20"
                aria-label="Open settings"
                title="Settings"
              >
                👤
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-6 pb-36 md:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile FAB for add */}
      <button
        onClick={() => setOpenAdd(true)}
        className="fixed right-5 md:hidden rounded-full bg-emerald-500 px-5 py-4 text-black font-bold shadow-lg hover:opacity-90"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        aria-label="Add transaction"
        title="Add transaction"
      >
        +
      </button>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden border-t border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950">
        <div
          className={[
            "grid",
            NAV.filter((n) => n.href !== "/settings").length === 6
              ? "grid-cols-6"
              : NAV.filter((n) => n.href !== "/settings").length === 5
              ? "grid-cols-5"
              : "grid-cols-4",
          ].join(" ")}
        >
          {NAV.filter((n) => n.href !== "/settings").map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex flex-col items-center justify-center py-3 text-xs transition",
                  active ? "opacity-100" : "opacity-60",
                ].join(" ")}
              >
                <div className="text-lg">{item.icon}</div>
                <div>{item.label}</div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ✅ Global AI Assistant (shows everywhere) */}
      <AIAssistant />
    </div>
  );
}
