import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReceiptParseRequest = {
  image_data_url: string;
  categories?: string[];
  timezone?: string;
};

type ReceiptParseResult = {
  merchant: string | null;
  occurred_on: string | null; // YYYY-MM-DD
  total: number | null;
  currency: string | null;
  category: string | null;
  note: string | null;
  tax: number | null;
  tip: number | null;
  confidence: {
    merchant: number;
    occurred_on: number;
    total: number;
  };
};

type UnknownRecord = Record<string, unknown>;

function asRecord(v: unknown): UnknownRecord | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as UnknownRecord;
  return null;
}

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

function extractAssistantTextFromUpstream(data: unknown): string {
  const root = asRecord(data);
  if (!root) return "";

  const choices = asArray(root.choices);
  const firstChoice = choices ? asRecord(choices[0]) : null;
  const msg = firstChoice ? asRecord(firstChoice.message) : null;
  const content = msg?.content;
  if (typeof content === "string" && content.trim()) return content.trim();

  const ot = root.output_text;
  if (typeof ot === "string" && ot.trim()) return ot.trim();

  const output = asArray(root.output);
  if (output) {
    const chunks: string[] = [];
    for (const item of output) {
      const itemRec = asRecord(item);
      const contentArr = itemRec ? asArray(itemRec.content) : null;
      if (!contentArr) continue;
      for (const c of contentArr) {
        const cRec = asRecord(c);
        const t = cRec?.type;
        const text = cRec?.text;
        if ((t === "output_text" || t === "text") && typeof text === "string") {
          chunks.push(text);
        }
      }
    }
    const joined = chunks.join("\n").trim();
    if (joined) return joined;
  }

  const altMsg = asRecord(root.message);
  const altContent = altMsg?.content;
  if (typeof altContent === "string" && altContent.trim()) return altContent.trim();

  return "";
}

function safeJsonParse<T>(raw: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

function clamp01(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function isValidISODate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeResult(parsed: unknown, categories?: string[]): ReceiptParseResult {
  const rec = asRecord(parsed) ?? {};
  const conf = asRecord(rec.confidence) ?? {};
  const allowed = new Set((categories ?? []).filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()));
  const categoryRaw = typeof rec.category === "string" ? rec.category.trim() : null;
  const category = categoryRaw && (allowed.size === 0 || allowed.has(categoryRaw)) ? categoryRaw : null;

  const occurred_on_raw = rec.occurred_on;
  const occurred_on = isValidISODate(occurred_on_raw) ? occurred_on_raw : null;

  const total_raw = rec.total;
  const total_num = typeof total_raw === "number" ? total_raw : Number(total_raw);
  const total = Number.isFinite(total_num) && total_num > 0 ? Number(total_num) : null;

  const tax_raw = rec.tax;
  const tax_num = typeof tax_raw === "number" ? tax_raw : Number(tax_raw);
  const tax = Number.isFinite(tax_num) && tax_num >= 0 ? Number(tax_num) : null;

  const tip_raw = rec.tip;
  const tip_num = typeof tip_raw === "number" ? tip_raw : Number(tip_raw);
  const tip = Number.isFinite(tip_num) && tip_num >= 0 ? Number(tip_num) : null;

  const merchant = typeof rec.merchant === "string" && rec.merchant.trim() ? rec.merchant.trim() : null;
  const note = typeof rec.note === "string" && rec.note.trim() ? rec.note.trim() : null;
  const currency = typeof rec.currency === "string" && rec.currency.trim() ? rec.currency.trim() : null;

  const confidence = {
    merchant: clamp01(conf.merchant),
    occurred_on: clamp01(conf.occurred_on),
    total: clamp01(conf.total),
  };

  return { merchant, occurred_on, total, currency, category, note, tax, tip, confidence };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ReceiptParseRequest>;
    const imageDataUrl = body?.image_data_url;
    const categories = Array.isArray(body?.categories) ? body?.categories.slice(0, 50) : [];

    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: { message: "Missing or invalid image_data_url (expected data:image/* data URL)." } }, { status: 400 });
    }

    // Basic abuse guard: keep requests reasonably sized.
    if (imageDataUrl.length > 8_000_000) {
      return NextResponse.json({ error: { message: "Image too large. Try a smaller photo." } }, { status: 413 });
    }

    const url = process.env.AZURE_FOUNDRY_RESPONSES_URL;
    const apiKey = process.env.AZURE_FOUNDRY_API_KEY;

    if (!url || !apiKey) {
      return NextResponse.json(
        { error: { message: "Missing AZURE_FOUNDRY_API_KEY or AZURE_FOUNDRY_RESPONSES_URL." } },
        { status: 500 }
      );
    }

    const systemPrompt =
      "You are a receipt-parsing assistant inside a budgeting app.\n" +
      "Extract the purchase details from the receipt image.\n" +
      "Return ONLY valid JSON matching this schema:\n" +
      "{\n" +
      '  "merchant": string|null,\n' +
      '  "occurred_on": "YYYY-MM-DD"|null,\n' +
      '  "total": number|null,\n' +
      '  "currency": string|null,\n' +
      '  "category": string|null,\n' +
      '  "note": string|null,\n' +
      '  "tax": number|null,\n' +
      '  "tip": number|null,\n' +
      '  "confidence": { "merchant": number, "occurred_on": number, "total": number }\n' +
      "}\n" +
      "Rules:\n" +
      "- Use null if you are not confident.\n" +
      "- total MUST be the final charged amount (not subtotal).\n" +
      "- occurred_on MUST be the purchase date.\n" +
      "- If you choose a category, it MUST be one of the provided categories list.\n" +
      "- note should be short (e.g., \"Latte + sandwich\").\n" +
      "- confidence fields are 0..1.\n";

    const userText =
      "Categories:\n" +
      (categories.length ? categories.map((c) => `- ${c}`).join("\n") : "- (no categories provided)") +
      "\n\nReturn JSON only.";

    // Azure/OpenAI chat-completions image input format.
    const upstreamPayload = {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 700,
      temperature: 0.2,
      stream: false,
    };

    const upstreamRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(upstreamPayload),
    });

    const raw = await upstreamRes.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!upstreamRes.ok) {
      const dataRec = asRecord(data);
      const errRec = dataRec ? asRecord(dataRec.error) : null;
      return NextResponse.json(
        {
          error: {
            message:
              (typeof errRec?.message === "string" ? errRec.message : null) ||
              (typeof dataRec?.message === "string" ? dataRec.message : null) ||
              raw ||
              `Upstream error (${upstreamRes.status})`,
            status: upstreamRes.status,
          },
        },
        { status: upstreamRes.status }
      );
    }

    const assistantText = extractAssistantTextFromUpstream(data);
    const parsed = safeJsonParse<unknown>(assistantText || "");
    if (!parsed.ok) {
      return NextResponse.json(
        {
          error: { message: "Model did not return valid JSON.", detail: parsed.error },
          raw_text: assistantText,
        },
        { status: 502 }
      );
    }

    const result = normalizeResult(parsed.value, categories);
    return NextResponse.json({ result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error in /api/receipt";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
