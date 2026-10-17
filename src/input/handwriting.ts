import type { Lang } from "../types.ts";
import type { OcrEngine } from "./ocr.ts";

/**
 * Finger handwriting → text.
 *
 * 1. Native: the Handwriting Recognition API (`navigator.createHandwritingRecognizer`).
 *    Today only Chromium on ChromeOS ships a recognizer; other browsers lack the API
 *    or report no model for the language.
 * 2. Fallback: the drawing is rendered black-on-white and read by the same free,
 *    on-device tesseract.js OCR used for photos. It reads neat block print; cursive
 *    mostly fails. There is no free hosted handwriting API we can call without a key,
 *    so we do not pretend there is one.
 */
export type Point = { x: number; y: number; t: number };
export type Stroke = Point[];

export type HandwritingEngine = {
  kind: "native" | "ocr";
  recognize(strokes: readonly Stroke[], lang: Lang): Promise<string>;
};

type NativeStroke = { addPoint(point: Point): void };
type NativeDrawing = {
  addStroke(stroke: NativeStroke): void;
  getPrediction(): Promise<Array<{ text: string }>>;
  clear(): void;
};
type NativeRecognizer = {
  startDrawing(hints?: Record<string, unknown>): NativeDrawing;
  finish?(): void;
};
export type HandwritingNavigator = {
  createHandwritingRecognizer?: (constraint: { languages: string[] }) => Promise<NativeRecognizer>;
  queryHandwritingRecognizer?: (constraint: { languages: string[] }) => Promise<unknown>;
};
type StrokeCtor = new () => NativeStroke;

export function hasNativeHandwriting(nav: HandwritingNavigator | undefined, strokeCtor: unknown): boolean {
  return Boolean(nav && typeof nav.createHandwritingRecognizer === "function" && typeof strokeCtor === "function");
}

export function createNativeEngine(nav: HandwritingNavigator, Stroke: StrokeCtor): HandwritingEngine {
  const recognizers = new Map<Lang, Promise<NativeRecognizer>>();
  const recognizerFor = (lang: Lang) => {
    let pending = recognizers.get(lang);
    if (!pending) {
      pending = nav.createHandwritingRecognizer!({ languages: [lang] });
      recognizers.set(lang, pending);
      pending.catch(() => recognizers.delete(lang));
    }
    return pending;
  };
  return {
    kind: "native",
    async recognize(strokes, lang) {
      if (!strokes.length) return "";
      const recognizer = await recognizerFor(lang);
      const drawing = recognizer.startDrawing({ recognitionType: "text", inputType: "touch", alternatives: 1 });
      for (const points of strokes) {
        const stroke = new Stroke();
        for (const point of points) stroke.addPoint(point);
        drawing.addStroke(stroke);
      }
      try {
        const predictions = await drawing.getPrediction();
        return (predictions[0]?.text ?? "").trim();
      } finally {
        drawing.clear();
      }
    },
  };
}

/** Native when the browser has a model for `lang`, otherwise OCR on the drawing. */
export async function pickHandwritingEngine(
  lang: Lang,
  ocrEngine: HandwritingEngine,
  nav: HandwritingNavigator | undefined = globalThis.navigator as HandwritingNavigator | undefined,
  strokeCtor: unknown = (globalThis as { HandwritingStroke?: unknown }).HandwritingStroke,
): Promise<HandwritingEngine> {
  if (!hasNativeHandwriting(nav, strokeCtor)) return ocrEngine;
  try {
    if (nav!.queryHandwritingRecognizer) {
      const support = await nav!.queryHandwritingRecognizer({ languages: [lang] });
      if (!support) return ocrEngine;
    }
    return createNativeEngine(nav!, strokeCtor as StrokeCtor);
  } catch {
    return ocrEngine;
  }
}

/** Bounding box of the ink with padding, for cropping before OCR. */
export function inkBounds(strokes: readonly Stroke[], pad = 16): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

/** Fallback engine: redraw the strokes thick and black on white, then OCR. */
export function createOcrHandwritingEngine(ocr: OcrEngine): HandwritingEngine {
  return {
    kind: "ocr",
    async recognize(strokes, lang) {
      const box = inkBounds(strokes, 24);
      if (!box) return "";
      const scale = Math.min(3, Math.max(1, 160 / Math.max(1, box.h)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(box.w * scale);
      canvas.height = Math.ceil(box.h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 7 * scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const stroke of strokes) {
        ctx.beginPath();
        stroke.forEach((p, i) => {
          const x = (p.x - box.x) * scale;
          const y = (p.y - box.y) * scale;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        if (stroke.length === 1) ctx.lineTo((stroke[0].x - box.x) * scale + 0.1, (stroke[0].y - box.y) * scale);
        ctx.stroke();
      }
      const { text } = await ocr(canvas, lang);
      return text.replace(/\s+/g, " ").trim();
    },
  };
}
