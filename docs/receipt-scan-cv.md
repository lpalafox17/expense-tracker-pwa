# Receipt Scan (Computer Vision + Vision AI)

This project now includes a “Scan receipt” flow that demonstrates practical computer vision in a budgeting app:

1) **Capture / upload an image** (camera on mobile via `capture="environment"`).
2) **Client-side CV preprocessing** (fast auto-crop using edges).
3) **Vision model extraction** (LLM with image input returns strict JSON).
4) **Apply results** to the “Add transaction” form.

The goal is learning: the code is intentionally straightforward and readable.

---

## 1) Image capture (web)

File: `app/(app)/components/ReceiptScanModal.tsx`

- The UI uses an `<input type="file" accept="image/*" capture="environment" />`.
  - `accept="image/*"` restricts to images.
  - `capture="environment"` hints to mobile browsers to open the *rear* camera.
- When a user selects a file, we call `onFile(file)` which kicks off preprocessing.

Key concept: **the browser gives you a `File`**. Everything else (preview, processing, uploads) is built from that.

---

## 2) Data URLs (how we “store” images in memory)

File: `app/(app)/lib/vision/receiptPreprocess.ts`

- `fileToDataUrl(file)` uses `FileReader.readAsDataURL`.
- A data URL looks like: `data:image/jpeg;base64,...`

Key concept: a data URL is convenient for:
- rendering previews (`<img src="data:image/...">`)
- sending an image to an API without multi-part form data

Tradeoff: data URLs are bigger than raw bytes, so we add an API size guard.

---

## 3) CV preprocessing (auto-crop via edges)

File: `app/(app)/lib/vision/receiptPreprocess.ts`

### 3.1 Downscaling

Receipts are high-res, but CV is faster on smaller images.

- `createImageBitmap(file)` decodes the image efficiently.
- We scale to `maxDimension` (default `1400`) before running any pixel math.

Key concept: **downscaling is often the biggest performance win**.

### 3.2 Grayscale conversion

We convert RGBA pixels into a single channel using “luma”:

`gray = 0.2126*R + 0.7152*G + 0.0722*B`

Key concept: edge detection and many CV operators work on grayscale.

### 3.3 Sobel edge detection (finding “where the paper is”)

Sobel is a classic operator that estimates gradients:

- `Gx` detects horizontal changes (vertical edges)
- `Gy` detects vertical changes (horizontal edges)
- magnitude = `sqrt(Gx^2 + Gy^2)`

Key concept: **edges highlight the receipt boundaries and text regions**.

### 3.4 Threshold + bounding box

We:
- compute an edge-magnitude histogram
- choose a high percentile threshold (`92%`) to keep “strong” edges
- find the min/max `x/y` of pixels above threshold
- add a small margin and crop

This is a heuristic: it’s not perfect, but it’s fast and often good enough for receipts.

Key concept: you don’t always need “heavy” CV libraries—simple operators + heuristics can produce big UX wins.

---

## 4) Vision AI extraction (strict JSON)

File: `app/(app)/api/receipt/route.ts`

- The client sends `{ image_data_url, categories }` to `/api/receipt`.
- The server calls your existing Azure Foundry (Azure OpenAI) Chat Completions endpoint.
- We use the **image input** format where `message.content` is an array:
  - `{ type: "text", text: ... }`
  - `{ type: "image_url", image_url: { url: "data:image/..." } }`

Key concept: treat the model as an **unreliable parser**:
- force a schema
- require “JSON only”
- validate and normalize fields server-side

---

## 5) Applying results to the form

File: `app/(app)/components/AddTransactionModal.tsx`

- Clicking “Scan receipt” opens the scan modal.
- “Apply to transaction” maps:
  - `total` → `amount`
  - `occurred_on` → date input
  - `category` → select
  - `merchant/note` → note field

Key concept: keep AI output as a **draft** the user can edit, not an automatic write.

---

## Month locking (prevent edits to past months)

Files:

- `app/(app)/lib/monthLock.ts`
- `app/(app)/components/AddTransactionModal.tsx`
- `app/(app)/components/AIAssistant.tsx`

Rule: **new transactions can only be added in the current month** (`YYYY-MM` based on the user’s device clock).

Why: it prevents accidental back-dating (common with receipts) and keeps past-month totals “locked” once a new month begins.

---

## Ideas to make it even cooler

- **Perspective correction**: detect 4 corners (contours), then warp the receipt to a flat rectangle.
- **Live camera mode**: show video + auto-capture when the receipt is stable/in-frame.
- **Line item extraction**: parse items and let users split an expense across categories.
- **Fraud/duplicate detection**: perceptual hash (pHash) to detect repeated receipts.
