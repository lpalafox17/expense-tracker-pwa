"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  typing?: boolean;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const QUICK_PROMPTS = [
  "Where did I spend the most this month?",
  "Give me 3 ways to cut spending next month.",
  "Do I have subscriptions I should cancel?",
  "Create a realistic grocery budget for me.",
];

const STARTER: Msg[] = [
  {
    id: uid(),
    role: "assistant",
    ts: Date.now(),
    content:
      "Hey — I’m your finance assistant.\nAsk me about spending, budgets, or subscriptions.\n\nPick a prompt below to start 👇",
  },
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500/70 [animation-delay:-0.2s]" />
      <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500/70 [animation-delay:-0.1s]" />
      <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500/70" />
    </div>
  );
}

/**
 * Tries to pull readable assistant text out of:
 * - Chat Completions: data.choices[0].message.content
 * - Responses API: data.output_text
 * - Responses API (structured): data.output[].content[] where type==="output_text"
 */
function extractAssistantText(data: any): string {
  if (!data) return "";

  const cc = data?.choices?.[0]?.message?.content;
  if (typeof cc === "string" && cc.trim()) return cc.trim();

  const ot = data?.output_text;
  if (typeof ot === "string" && ot.trim()) return ot.trim();

  const output = data?.output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const item of output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;

      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string") {
          chunks.push(c.text);
        } else if (c?.type === "text" && typeof c?.text === "string") {
          chunks.push(c.text);
        }
      }
    }
    const joined = chunks.join("\n").trim();
    if (joined) return joined;
  }

  const alt = data?.message?.content;
  if (typeof alt === "string" && alt.trim()) return alt.trim();

  return "";
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(STARTER);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const close = () => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 180);
  };

  // Open from anywhere via: window.dispatchEvent(new Event("ai:open"))
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("ai:open", handler);
    return () => window.removeEventListener("ai:open", handler);
  }, []);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => textareaRef.current?.focus(), 60);
  }, [open]);

  // Auto-scroll
  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  const canSend = useMemo(() => text.trim().length > 0 && !sending, [text, sending]);

  const newChat = () => {
    if (sending) return;
    setMessages(STARTER);
    setText("");
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // Show prompt chips only when user hasn't said anything yet
  const showPromptChips = useMemo(() => {
    const anyUser = messages.some((m) => m.role === "user");
    return !anyUser && !sending;
  }, [messages, sending]);

  async function getAccessToken(): Promise<string> {
    // Ensures we try to refresh if needed
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token || "";
  }

  const send = async (override?: string) => {
    const value = (override ?? text).trim();
    if (!value || sending) return;

    setSending(true);

    const userMsg: Msg = { id: uid(), role: "user", content: value, ts: Date.now() };
    const typingId = uid();

    // Optimistic UI: add user msg + typing placeholder
    setMessages((m) => [
      ...m,
      userMsg,
      { id: typingId, role: "assistant", content: "", ts: Date.now(), typing: true },
    ]);
    setText("");

    try {
      // Require login (or show a clean message)
      const token = await getAccessToken();
      if (!token) {
        throw new Error("You’re not logged in. Please sign in to use the AI assistant.");
      }

      // Build history to send (exclude typing placeholders)
      const history = [...messages, userMsg]
        .filter((m) => !m.typing)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // ✅ THIS FIXES YOUR ERROR
        },
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error?.message || data?.message || `AI request failed (${res.status})`;
        throw new Error(msg);
      }

      const answer = extractAssistantText(data);
      if (!answer) {
        throw new Error(
          "I got a response, but it didn’t include readable text. (Check your API response shape.)"
        );
      }

      setMessages((m) =>
        m.map((x) => (x.id === typingId ? { ...x, typing: false, content: answer } : x))
      );
    } catch (e: any) {
      setMessages((m) =>
        m.map((x) =>
          x.id === typingId
            ? {
                ...x,
                typing: false,
                content:
                  `⚠️ ${e?.message || "AI request failed"}\n\n` +
                  "(If this keeps happening, check your /api/ai route + env vars.)",
              }
            : x
        )
      );
    } finally {
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 40);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(true)}
        className={[
          "fixed z-40",
          "left-5 right-auto bottom-[calc(4.5rem+env(safe-area-inset-bottom))]",
          "md:left-auto md:right-5 md:bottom-5",
          "rounded-full px-4 py-2 text-xs font-semibold",
          "sm:px-5 sm:py-3 sm:text-sm",
          "text-black shadow-[0_12px_30px_-18px_rgba(16,185,129,0.8)]",
          "bg-gradient-to-r from-emerald-400 via-emerald-500 to-cyan-400",
          "hover:opacity-90 active:scale-[0.99]",
        ].join(" ")}
      >
        ✨ AI
      </button>

      {open && (
        <div
          className={[
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
            closing ? "animate-[fadeOut_180ms_ease-in]" : "animate-[fadeIn_160ms_ease-out]",
          ].join(" ")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          {/* Panel */}
          <div
            className={[
              "fixed right-0 top-0 h-full w-full max-w-[440px]",
              "border-l border-zinc-200 bg-white shadow-2xl",
              "dark:border-white/10 dark:bg-zinc-950",
              closing
                ? "animate-[panelOut_180ms_ease-in]"
                : "animate-[panelIn_220ms_cubic-bezier(0.2,0.8,0.2,1)]",
            ].join(" ")}
          >
            {/* Header */}
            <div className="border-b border-zinc-200 px-4 py-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-black flex items-center justify-center font-extrabold">
                    AI
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate text-zinc-900 dark:text-zinc-50">
                      Finance Assistant
                    </p>
                    <p className="text-xs opacity-60 leading-tight truncate text-zinc-600 dark:text-zinc-300">
                      Private insights • Uses summaries only
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={newChat}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:hover:bg-white/10"
                    title="New chat"
                  >
                    New
                  </button>
                  <button
                    onClick={close}
                    className="rounded-xl px-2 py-1 text-lg text-zinc-900 hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-white/10"
                    aria-label="Close"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={listRef} className="h-[calc(100%-132px)] overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                const isFirstAssistant = idx === 0 && m.role === "assistant";

                return (
                  <div key={m.id} className="space-y-2">
                    <div className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                      {!isUser && (
                        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-black flex items-center justify-center text-xs font-extrabold">
                          AI
                        </div>
                      )}

                      <div
                        className={[
                          "max-w-[82%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm",
                          isUser
                            ? "bg-emerald-600 text-white"
                            : "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-zinc-50",
                        ].join(" ")}
                      >
                        {m.typing ? <TypingDots /> : <span className="whitespace-pre-line">{m.content}</span>}
                      </div>

                      {isUser && (
                        <div className="h-8 w-8 rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-center dark:border-white/10 dark:bg-white/5">
                          👤
                        </div>
                      )}
                    </div>

                    {isFirstAssistant && showPromptChips && (
                      <div className="ml-10 flex flex-wrap gap-2">
                        {QUICK_PROMPTS.map((p) => (
                          <button
                            key={p}
                            onClick={() => send(p)}
                            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50 dark:hover:bg-white/10"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="border-t border-zinc-200 p-4 dark:border-white/10">
              <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-white/5">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Message Finance Copilot…"
                  rows={1}
                  className={[
                    "w-full resize-none bg-transparent px-2 py-2 text-sm outline-none",
                    "text-zinc-900 dark:text-zinc-50",
                    "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                    "caret-emerald-600 dark:caret-emerald-400",
                  ].join(" ")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />

                <div className="mt-2 flex items-center justify-between gap-2 px-2 pb-1">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Enter to send • Shift+Enter for new line
                  </p>

                  <button
                    onClick={() => send()}
                    disabled={!canSend}
                    className={[
                      "rounded-xl px-4 py-2 text-sm font-semibold transition",
                      canSend
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : "bg-zinc-200 text-zinc-500 dark:bg-white/10 dark:text-white/30",
                    ].join(" ")}
                  >
                    {sending ? "…" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Animations */}
          <style jsx global>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            @keyframes fadeOut {
              from {
                opacity: 1;
              }
              to {
                opacity: 0;
              }
            }
            @keyframes panelIn {
              from {
                transform: translateX(18px);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
            @keyframes panelOut {
              from {
                transform: translateX(0);
                opacity: 1;
              }
              to {
                transform: translateX(18px);
                opacity: 0;
              }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
