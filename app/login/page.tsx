"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  // If already logged in, send to home (hard redirect)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.location.href = "/";
      }
    });
  }, []);

  const signUp = async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      console.log("SignUp:", data, error);

      if (error) setMessage(error.message);
      else setMessage("Account created ✅ Now click Sign In.");
    } catch (e: any) {
      console.error("SignUp threw:", e);
      setMessage(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      console.log("SignIn:", data, error);

      if (error) setMessage(error.message);
      else window.location.href = "/";
    } catch (e: any) {
      console.error("SignIn threw:", e);
      setMessage(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold mb-6">Login</h1>

      <div className="w-full max-w-sm space-y-3">
        <input
          type="email"
          placeholder="Email"
          className="w-full border p-3 rounded bg-transparent"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full border p-3 rounded bg-transparent"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <div className="flex gap-3 pt-2">
          <button
            onClick={signIn}
            disabled={loading}
            className="flex-1 rounded bg-blue-600 px-4 py-3 text-white hover:opacity-90 disabled:opacity-50"
          >
            Sign In
          </button>

          <button
            onClick={signUp}
            disabled={loading}
            className="flex-1 rounded bg-green-600 px-4 py-3 text-white hover:opacity-90 disabled:opacity-50"
          >
            Sign Up
          </button>
        </div>

        {message && (
          <p className="pt-2 text-center text-red-500 whitespace-pre-wrap">
            {message}
          </p>
        )}

        <p className="pt-6 text-center text-sm opacity-70">
          After signing in, you’ll be redirected to the home page.
        </p>
      </div>
    </main>
  );
}
