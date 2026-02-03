"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Prefs = {
  currency: "USD" | "EUR" | "GBP";
  weekStartsOn: "sunday" | "monday";
  dateFormat: "mdy" | "dmy" | "ymd";
  incomeAccounts: string[];
  incomeSources: string[];
};

const DEFAULT_PREFS: Prefs = {
  currency: "USD",
  weekStartsOn: "monday",
  dateFormat: "mdy",
  incomeAccounts: ["Debit Card 1", "Debit Card 2"],
  incomeSources: ["Paycheck", "Transfer", "Refund", "Cash", "Other"],
};

function moneyLabel(currency: Prefs["currency"]) {
  if (currency === "USD") return "USD ($)";
  if (currency === "EUR") return "EUR (€)";
  return "GBP (£)";
}

function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem("prefs");
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: Prefs) {
  window.localStorage.setItem("prefs", JSON.stringify(p));
}

function panelBase() {
  return [
    "rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm",
    "dark:border-white/10 dark:bg-zinc-950/60",
  ].join(" ");
}

function chipBase(active: boolean) {
  return [
    "rounded-2xl px-3 py-2 text-sm font-semibold transition border",
    active
      ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-black dark:border-white"
      : "bg-white border-zinc-200 hover:bg-zinc-50 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10",
  ].join(" ");
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [newAccount, setNewAccount] = useState("");
  const [newSource, setNewSource] = useState("");

  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    setPrefs(readPrefs());

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      setEmail(user?.email ?? "");
      setUserId(user?.id ?? "");
      setLoading(false);
    };

    load();
  }, []);

  const onSavePrefs = () => {
    savePrefs(prefs);
    setMsg("Saved.");
    window.setTimeout(() => setMsg(""), 1200);
  };

  const exportCsv = async () => {
    setMsg("");
    setExporting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;

    if (!uid) {
      setMsg("Not logged in.");
      setExporting(false);
      return;
    }

    const { data, error } = await supabase
      .from("transactions")
      .select("occurred_on,type,amount,category,note,created_at")
      .eq("user_id", uid)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setExporting(false);
      return;
    }

    const rows = (data ?? []) as any[];

    const header = ["occurred_on", "type", "amount", "category", "note", "created_at"];

    const esc = (v: any) => {
      const s = v === null || v === undefined ? "" : String(v);
      // CSV escaping
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const csv = [
      header.join(","),
      ...rows.map((r) => header.map((k) => esc(r[k])).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setExporting(false);
    setMsg("Exported CSV.");
    window.setTimeout(() => setMsg(""), 1500);
  };

  const signOut = async () => {
    setMsg("");
    await supabase.auth.signOut();
    // Your app may auto-redirect; if not, you can push to /login here.
  };

  const initials = useMemo(() => {
    if (!email) return "U";
    return email.trim().slice(0, 1).toUpperCase();
  }, [email]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm opacity-70">Overview</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm opacity-70">
            Profile, preferences, and data controls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSavePrefs}
            className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Save
          </button>
          <button
            onClick={() => {
              setPrefs(readPrefs());
              setMsg("Reverted.");
              window.setTimeout(() => setMsg(""), 1200);
            }}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-950/60 dark:hover:bg-white/5"
          >
            Reset
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-white/10 dark:bg-white/5">
          {msg}
        </div>
      )}

      {/* Profile */}
      <div className={panelBase()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Profile</h3>
            <p className="mt-1 text-sm opacity-70">
              Basic account info (read-only for now).
            </p>
          </div>

          <div className="h-12 w-12 rounded-2xl border border-zinc-200 bg-zinc-50 flex items-center justify-center text-lg font-bold dark:border-white/10 dark:bg-white/5">
            {initials}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs opacity-60">Email</p>
            <p className="mt-1 text-sm font-semibold truncate">
              {loading ? "Loading…" : (email || "—")}
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs opacity-60">User ID</p>
            <p className="mt-1 text-sm font-semibold truncate">
              {loading ? "Loading…" : (userId || "—")}
            </p>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className={panelBase()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Preferences</h3>
            <p className="mt-1 text-sm opacity-70">
              These settings are saved locally for now.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {/* Currency */}
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm font-semibold">Currency</p>
            <p className="mt-1 text-xs opacity-60">Display format for totals.</p>

            <div className="mt-3 flex flex-col gap-2">
              <select
                value={prefs.currency}
                onChange={(e) => setPrefs((p) => ({ ...p, currency: e.target.value as any }))}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-white/5"
              >
                <option value="USD">{moneyLabel("USD")}</option>
                <option value="EUR">{moneyLabel("EUR")}</option>
                <option value="GBP">{moneyLabel("GBP")}</option>
              </select>
            </div>
          </div>

          {/* Week starts */}
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm font-semibold">Week starts</p>
            <p className="mt-1 text-xs opacity-60">For weekly summaries later.</p>

            <div className="mt-3 flex gap-2">
              <button
                className={chipBase(prefs.weekStartsOn === "monday")}
                onClick={() => setPrefs((p) => ({ ...p, weekStartsOn: "monday" }))}
              >
                Monday
              </button>
              <button
                className={chipBase(prefs.weekStartsOn === "sunday")}
                onClick={() => setPrefs((p) => ({ ...p, weekStartsOn: "sunday" }))}
              >
                Sunday
              </button>
            </div>
          </div>

          {/* Date format */}
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm font-semibold">Date format</p>
            <p className="mt-1 text-xs opacity-60">How dates will display.</p>

            <div className="mt-3 grid gap-2">
              <button
                className={chipBase(prefs.dateFormat === "mdy")}
                onClick={() => setPrefs((p) => ({ ...p, dateFormat: "mdy" }))}
              >
                MM/DD/YYYY
              </button>
              <button
                className={chipBase(prefs.dateFormat === "dmy")}
                onClick={() => setPrefs((p) => ({ ...p, dateFormat: "dmy" }))}
              >
                DD/MM/YYYY
              </button>
              <button
                className={chipBase(prefs.dateFormat === "ymd")}
                onClick={() => setPrefs((p) => ({ ...p, dateFormat: "ymd" }))}
              >
                YYYY-MM-DD
              </button>
            </div>
          </div>
        </div>

        {/* Income routing */}
        <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
          <p className="text-sm font-semibold">Income routing</p>
          <p className="mt-1 text-xs opacity-60">
            Customize the accounts and sources shown when adding income.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] opacity-60">Accounts</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {prefs.incomeAccounts.map((a) => (
                  <button
                    key={a}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    onClick={() =>
                      setPrefs((p) => ({
                        ...p,
                        incomeAccounts: p.incomeAccounts.filter((x) => x !== a),
                      }))
                    }
                    title="Remove"
                  >
                    {a} ✕
                  </button>
                ))}
              </div>

              <div className="mt-2 flex gap-2">
                <input
                  value={newAccount}
                  onChange={(e) => setNewAccount(e.target.value)}
                  placeholder="Add account (e.g., Chase Debit)"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-white/5"
                />
                <button
                  onClick={() => {
                    const v = newAccount.trim();
                    if (!v) return;
                    setPrefs((p) => ({
                      ...p,
                      incomeAccounts: p.incomeAccounts.includes(v) ? p.incomeAccounts : [...p.incomeAccounts, v],
                    }));
                    setNewAccount("");
                  }}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.12em] opacity-60">Sources</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {prefs.incomeSources.map((s) => (
                  <button
                    key={s}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    onClick={() =>
                      setPrefs((p) => ({
                        ...p,
                        incomeSources: p.incomeSources.filter((x) => x !== s),
                      }))
                    }
                    title="Remove"
                  >
                    {s} ✕
                  </button>
                ))}
              </div>

              <div className="mt-2 flex gap-2">
                <input
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder="Add source (e.g., Bonus)"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-white/5"
                />
                <button
                  onClick={() => {
                    const v = newSource.trim();
                    if (!v) return;
                    setPrefs((p) => ({
                      ...p,
                      incomeSources: p.incomeSources.includes(v) ? p.incomeSources : [...p.incomeSources, v],
                    }));
                    setNewSource("");
                  }}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data */}
      <div className={panelBase()}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Data</h3>
            <p className="mt-1 text-sm opacity-70">
              Export your transactions any time.
            </p>
          </div>

          <button
            onClick={exportCsv}
            disabled={exporting}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/60 dark:hover:bg-white/5"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>

        <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm opacity-80 dark:border-white/10 dark:bg-white/5">
          This downloads a CSV of your transactions (date, type, amount, category, note).
        </div>
      </div>

      {/* Danger zone */}
      <div className={panelBase()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Danger zone</h3>
            <p className="mt-1 text-sm opacity-70">Sign out of this device.</p>
          </div>

          <button
            onClick={signOut}
            className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/15 dark:text-red-200"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
