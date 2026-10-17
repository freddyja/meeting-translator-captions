import type { Lang } from "../types.ts";

/**
 * Photo text (OCR) with tesseract.js, loaded only when someone opens Photo or
 * the handwriting fallback. The worker, WASM core and eng/spa/por language
 * data come from the jsDelivr CDN on first use (cached by the browser after),
 * so it needs internet the first time and does not work in a fully offline room.
 * Free, runs on the device, no API key.
 */
export type OcrChoice = Lang | "auto";

const TESS_LANG: Record<Lang, string> = { en: "eng", es: "spa", pt: "por" };

export function tesseractLangs(choice: OcrChoice): string {
  if (choice === "auto") return "eng+spa+por";
  return TESS_LANG[choice];
}

/** Longest OCR text sent on as one caption. The translate API body is capped at 8 KB. */
export const OCR_MAX_CHARS = 600;

/** Tesseract keeps line breaks and hyphenation; a caption wants one clean paragraph. */
export function cleanOcrText(raw: string, max = OCR_MAX_CHARS): string {
  const joined = raw
    .replace(/\r/g, "")
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
    .replace(/[|_~`^]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\p{L}{2,}|\d/u.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (joined.length <= max) return joined;
  const cut = joined.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

export type OcrProgress = (status: "loading" | "reading", pct: number) => void;

type TessWorker = {
  recognize(image: unknown): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<unknown>;
};

export type OcrEngine = (image: Blob | HTMLCanvasElement, choice: OcrChoice, onProgress?: OcrProgress) => Promise<{
  text: string;
  confidence: number;
}>;

const workers = new Map<string, Promise<TessWorker>>();
let progressSink: OcrProgress | undefined;

async function workerFor(langs: string): Promise<TessWorker> {
  let pending = workers.get(langs);
  if (!pending) {
    pending = (async () => {
      const tess = await import("tesseract.js");
      const createWorker = (tess as { createWorker?: unknown }).createWorker ??
        (tess as { default?: { createWorker?: unknown } }).default?.createWorker;
      if (typeof createWorker !== "function") throw new Error("tesseract.js missing createWorker");
      return (await createWorker(langs, 1, {
        logger: (m: { status?: string; progress?: number }) => {
          const pct = Math.round((m.progress ?? 0) * 100);
          progressSink?.(m.status === "recognizing text" ? "reading" : "loading", pct);
        },
      })) as TessWorker;
    })();
    workers.set(langs, pending);
    // A failed load (offline, CDN blocked) must be retryable.
    pending.catch(() => workers.delete(langs));
  }
  return pending;
}

export const tesseractOcr: OcrEngine = async (image, choice, onProgress) => {
  progressSink = onProgress;
  onProgress?.("loading", 0);
  const worker = await workerFor(tesseractLangs(choice));
  const { data } = await worker.recognize(image);
  progressSink = undefined;
  return { text: data.text ?? "", confidence: data.confidence ?? 0 };
};
