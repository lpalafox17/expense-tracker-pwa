"use client";

import { useMemo, useRef, useState } from "react";
import { preprocessReceiptImage, type ReceiptPreprocessOutput } from "../lib/vision/receiptPreprocess";
import { CATEGORIES } from "../lib/categories";

type ReceiptParseResult = {
  merchant: string | null;
  occurred_on: string | null;
  total: number | null;
  currency: string | null;
  category: string | null;
  note: string | null;
  tax: number | null;
  tip: number | null;
  confidence: { merchant: number; occurred_on: number; total: number };
};

function money(n: number | null) {
  if (n == null) return "—";
  return `$${Number(n).toFixed(2)}`;
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e ?? "Unknown error");
}

function apiErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const rec = data as Record<string, unknown>;
  const err = rec.error;
  if (!err || typeof err !== "object" || Array.isArray(err)) return null;
  const errRec = err as Record<string, unknown>;
  return typeof errRec.message === "string" ? errRec.message : null;
}

export default function ReceiptScanModal({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (result: ReceiptParseResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [fileName, setFileName] = useState<string | null>(null);
  const [pre, setPre] = useState<ReceiptPreprocessOutput | null>(null);
  const [useCropped, setUseCropped] = useState(true);
  const imageDataUrl = useCropped ? pre?.croppedDataUrl : pre?.fullDataUrl;

  const [result, setResult] = useState<ReceiptParseResult | null>(null);

  const categories = useMemo(() => CATEGORIES.map((c) => c.name), []);
  const showCvDebug = useMemo(() => process.env.NEXT_PUBLIC_SHOW_CV_DEBUG === "1", []);

  const closeWithAnim = () => {
    if (busy) return;
    setClosing(true);
    window.setTimeout(() => {
      onClose();
      setClosing(false);
    }, 180);
  };

  const pick = () => inputRef.current?.click();

  const onFile = async (file: File) => {
    setErrorMsg("");
    setResult(null);
    setBusy(true);
    setFileName(file.name);
    try {
      const out = await preprocessReceiptImage(file);
      setPre(out);
      setUseCropped(Boolean(out.crop));
    } catch (e: unknown) {
      setErrorMsg(errorMessage(e) || "Failed to process image.");
      setPre(null);
    } finally {
      setBusy(false);
    }
  };

  const extract = async () => {
    setErrorMsg("");
    setResult(null);
    if (!imageDataUrl) {
      setErrorMsg("Pick a receipt photo first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_data_url: imageDataUrl,
          categories,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      const data = (await res.json()) as unknown;
      if (!res.ok) {
        setErrorMsg(apiErrorMessage(data) || "Receipt extraction failed.");
        return;
      }
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const rec = data as Record<string, unknown>;
        const r = rec.result;
        if (r && typeof r === "object" && !Array.isArray(r)) {
          setResult(r as ReceiptParseResult);
        } else {
          setErrorMsg("Unexpected response from /api/receipt.");
        }
      } else {
        setErrorMsg("Unexpected response from /api/receipt.");
      }
    } catch (e: unknown) {
      setErrorMsg(errorMessage(e) || "Network error calling /api/receipt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={[
        "fixed inset-0 z-[60] flex items-end md:items-center justify-center p-3",
        "bg-black/40 backdrop-blur-sm",
        closing ? "animate-[fadeOut_180ms_ease-in]" : "animate-[fadeIn_160ms_ease-out]",
      ].join(" ")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeWithAnim();
      }}
    >
      <div
        className={[
          "w-full md:max-w-3xl",
          "rounded-t-3xl md:rounded-3xl",
          "border shadow-2xl",
          "bg-white text-zinc-900 border-zinc-200",
          "dark:bg-zinc-950 dark:text-zinc-50 dark:border-white/10",
          "p-5",
          closing ? "animate-[modalOut_180ms_ease-in]" : "animate-[modalIn_220ms_cubic-bezier(0.2,0.8,0.2,1)]",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold tracking-tight">Scan receipt</h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Upload a photo → auto-crop → AI extracts merchant/date/total.
            </p>
          </div>
          <button
            onClick={closeWithAnim}
            className={[
              "rounded-2xl px-3 py-2 transition",
              "border border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
              "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
            ].join(" ")}
            title="Close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />

        <div className="mt-4 grid grid-cols-1 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={pick}
              disabled={busy}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                "border border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
                "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                busy ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
            >
              {pre ? "Pick another photo" : "Pick receipt photo"}
            </button>

            <button
              onClick={extract}
              disabled={busy || !imageDataUrl}
              aria-busy={busy}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                "bg-zinc-900 text-white hover:bg-zinc-800",
                "dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
                busy || !imageDataUrl ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Working
                </span>
              ) : (
                "Extract details"
              )}
            </button>

            {pre?.crop ? (
              <label className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
                <input type="checkbox" checked={useCropped} onChange={(e) => setUseCropped(e.target.checked)} />
                Use auto-crop
              </label>
            ) : null}
          </div>

          {fileName ? (
            <div className="min-w-0 text-sm text-zinc-500 dark:text-zinc-400 truncate">
              {fileName}
            </div>
          ) : null}
        </div>

        {errorMsg ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-3xl border border-zinc-200 dark:border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-white/10 text-sm font-semibold">
              Preview
            </div>
            <div className="p-3">
              {imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageDataUrl} alt="Receipt preview" className="w-full h-auto rounded-2xl border border-zinc-200 dark:border-white/10" />
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/20 p-6 text-sm text-zinc-500 dark:text-zinc-400">
                  Pick an image to see the preview.
                </div>
              )}

              {showCvDebug && pre ? (
                <details className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
                  <summary className="cursor-pointer select-none">CV debug (learning)</summary>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-zinc-200 dark:border-white/10 px-3 py-2">
                      <div className="font-semibold">Scaled</div>
                      <div className="tabular-nums">
                        {pre.debug.scaledWidth}×{pre.debug.scaledHeight}
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 dark:border-white/10 px-3 py-2">
                      <div className="font-semibold">Edge threshold</div>
                      <div className="tabular-nums">{pre.debug.edgeThreshold}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 dark:border-white/10 px-3 py-2">
                      <div className="font-semibold">Edge pixels</div>
                      <div className="tabular-nums">{pre.debug.edgePixelCount}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 dark:border-white/10 px-3 py-2">
                      <div className="font-semibold">Crop</div>
                      <div className="tabular-nums">
                        {pre.crop ? `${pre.crop.w}×${pre.crop.h}` : "—"}
                      </div>
                    </div>
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 dark:border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-white/10 text-sm font-semibold">
              Extracted fields
            </div>
            <div className="p-4">
              {result ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-400">Merchant</div>
                      <div className="font-semibold">{result.merchant ?? "—"}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                        conf {Math.round(result.confidence.merchant * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-400">Date</div>
                      <div className="font-semibold tabular-nums">{result.occurred_on ?? "—"}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                        conf {Math.round(result.confidence.occurred_on * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-400">Total</div>
                      <div className="font-semibold tabular-nums">{money(result.total)}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                        conf {Math.round(result.confidence.total * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-400">Category</div>
                      <div className="font-semibold">{result.category ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-400">Tax</div>
                      <div className="font-semibold tabular-nums">{money(result.tax)}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 dark:text-zinc-400">Tip</div>
                      <div className="font-semibold tabular-nums">{money(result.tip)}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-zinc-500 dark:text-zinc-400">Note</div>
                      <div className="font-semibold">{result.note ?? "—"}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => onApply(result)}
                      className={[
                        "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                        "bg-zinc-900 text-white hover:bg-zinc-800",
                        "dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
                      ].join(" ")}
                    >
                      Apply to transaction
                    </button>
                    <button
                      onClick={closeWithAnim}
                      className={[
                        "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                        "border border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
                        "dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                      ].join(" ")}
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  No extraction yet. Click <span className="font-semibold">Extract details</span> after picking a photo.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
