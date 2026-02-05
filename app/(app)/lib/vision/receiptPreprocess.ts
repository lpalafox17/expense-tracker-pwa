export type ReceiptCrop = { x: number; y: number; w: number; h: number };

export type ReceiptPreprocessDebug = {
  scaledWidth: number;
  scaledHeight: number;
  edgeThreshold: number;
  edgePixelCount: number;
};

export type ReceiptPreprocessOutput = {
  fullDataUrl: string;
  croppedDataUrl: string;
  crop: ReceiptCrop | null;
  debug: ReceiptPreprocessDebug;
};

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function percentileFromHist(hist: Uint32Array, pct: number): number {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return 255;
  const target = total * clamp(pct, 0, 1);
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return hist.length - 1;
}

function computeEdgeBBox(gray: Uint8Array, w: number, h: number) {
  // Simple Sobel edge magnitude -> threshold -> axis-aligned bounding box.
  // (This is not perspective correction; it's a fast "auto-crop" heuristic.)
  const hist = new Uint32Array(256);
  const mags = new Uint8Array(w * h);

  let idx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        mags[idx++] = 0;
        continue;
      }
      const i = y * w + x;
      const tl = gray[i - w - 1];
      const tc = gray[i - w];
      const tr = gray[i - w + 1];
      const ml = gray[i - 1];
      const mr = gray[i + 1];
      const bl = gray[i + w - 1];
      const bc = gray[i + w];
      const br = gray[i + w + 1];

      // Sobel kernels:
      // Gx = [-1 0 1; -2 0 2; -1 0 1]
      // Gy = [-1 -2 -1; 0 0 0; 1 2 1]
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = Math.sqrt(gx * gx + gy * gy);

      // Normalize into 0..255-ish. Tweak divisor for typical phone photos.
      const m = clamp(Math.round(mag / 4), 0, 255);
      mags[idx++] = m;
      hist[m]++;
    }
  }

  const threshold = percentileFromHist(hist, 0.92);

  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  let count = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = mags[y * w + x];
      if (m < threshold) continue;
      count++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (count < 2000 || maxX < 0) {
    return { threshold, edgePixelCount: count, bbox: null as null | ReceiptCrop };
  }

  const marginX = Math.round((maxX - minX) * 0.06);
  const marginY = Math.round((maxY - minY) * 0.06);
  const x = clamp(minX - marginX, 0, w - 1);
  const y = clamp(minY - marginY, 0, h - 1);
  const w2 = clamp(maxX + marginX + 1, 1, w) - x;
  const h2 = clamp(maxY + marginY + 1, 1, h) - y;

  // Avoid “cropping to almost everything”, which can happen on noisy images.
  if (w2 / w > 0.98 && h2 / h > 0.98) {
    return { threshold, edgePixelCount: count, bbox: null };
  }

  return { threshold, edgePixelCount: count, bbox: { x, y, w: w2, h: h2 } };
}

export async function preprocessReceiptImage(
  file: File,
  opts?: { maxDimension?: number; jpegQuality?: number }
): Promise<ReceiptPreprocessOutput> {
  const maxDimension = opts?.maxDimension ?? 1400;
  const jpegQuality = opts?.jpegQuality ?? 0.85;

  const fullDataUrl = await fileToDataUrl(file);

  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bmp.width, bmp.height));
  const scaledWidth = Math.max(1, Math.round(bmp.width * scale));
  const scaledHeight = Math.max(1, Math.round(bmp.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = scaledWidth;
  canvas.height = scaledHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(bmp, 0, 0, scaledWidth, scaledHeight);
  const img = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
  const gray = new Uint8Array(scaledWidth * scaledHeight);
  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
    const r = img.data[i];
    const g = img.data[i + 1];
    const b = img.data[i + 2];
    // Luma (perceptual grayscale)
    gray[p] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }

  const { threshold, edgePixelCount, bbox } = computeEdgeBBox(gray, scaledWidth, scaledHeight);

  let croppedDataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
  let crop: ReceiptCrop | null = null;

  if (bbox) {
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = bbox.w;
    cropCanvas.height = bbox.h;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) throw new Error("Canvas not supported");
    cropCtx.drawImage(canvas, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);
    croppedDataUrl = cropCanvas.toDataURL("image/jpeg", jpegQuality);
    crop = bbox;
  }

  return {
    fullDataUrl,
    croppedDataUrl,
    crop,
    debug: { scaledWidth, scaledHeight, edgeThreshold: threshold, edgePixelCount },
  };
}

