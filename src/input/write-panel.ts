import { applyI18n, t } from "../i18n";
import type { Lang } from "../types";
import {
  createOcrHandwritingEngine,
  pickHandwritingEngine,
  type HandwritingEngine,
  type Stroke,
} from "./handwriting";
import { tesseractOcr, type OcrEngine } from "./ocr";

/**
 * Finger pad → text. Native Handwriting Recognition API when the browser has a
 * model for the language, else the free on-device tesseract.js OCR fallback.
 * Used by the room's ⋯ More sheet and by the standalone Write & translate page.
 */
export type WritePanelOptions = {
  lang: () => Lang;
  /** Recognized text (already trimmed, never empty). */
  onText: (text: string) => void;
  ocr?: OcrEngine;
};

export type WritePanel = {
  /** Re-measure the canvas (call after the panel becomes visible). */
  redraw(): void;
  clear(): void;
  destroy(): void;
};

export const WRITE_PANEL_HTML = `
  <p class="hint" data-write-hint></p>
  <canvas class="write-pad" data-write-pad data-i18n-aria="writeTitle"></canvas>
  <div class="row-actions write-actions">
    <button class="ghost" data-write-undo type="button" data-i18n="undoStroke"></button>
    <button class="ghost" data-write-clear type="button" data-i18n="clearDrawing"></button>
    <button class="primary" data-write-recognize type="button" data-i18n="recognize"></button>
  </div>
  <p class="hint" data-write-status role="status" aria-live="polite"></p>
`;

export function mountWritePanel(container: HTMLElement, options: WritePanelOptions): WritePanel {
  container.innerHTML = WRITE_PANEL_HTML;
  const q = <T extends Element>(sel: string) => container.querySelector(sel) as T;
  const pad = q<HTMLCanvasElement>("[data-write-pad]");
  const hint = q<HTMLElement>("[data-write-hint]");
  const status = q<HTMLElement>("[data-write-status]");
  const strokes: Stroke[] = [];
  let current: Stroke | null = null;
  let engine: HandwritingEngine | null = null;
  let engineLang: Lang | null = null;
  const fallback = createOcrHandwritingEngine(options.ocr ?? tesseractOcr);

  const redraw = () => {
    const ctx = pad.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = pad.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (pad.width !== w || pad.height !== h) {
      pad.width = w;
      pad.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = getComputedStyle(pad).color || "#fff";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
      ctx.beginPath();
      stroke.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.1, stroke[0].y);
      ctx.stroke();
    }
  };

  const ensureEngine = async () => {
    const lang = options.lang();
    if (!engine || engineLang !== lang) {
      engine = await pickHandwritingEngine(lang, fallback);
      engineLang = lang;
    }
    hint.textContent = engine.kind === "native" ? t("writeHintNative") : t("writeHintOcr");
    hint.dataset.engine = engine.kind;
    return engine;
  };

  const point = (event: PointerEvent) => {
    const rect = pad.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, t: Math.round(event.timeStamp) };
  };
  const onDown = (event: PointerEvent) => {
    event.preventDefault();
    pad.setPointerCapture?.(event.pointerId);
    current = [point(event)];
    strokes.push(current);
    redraw();
  };
  const onMove = (event: PointerEvent) => {
    if (!current) return;
    event.preventDefault();
    current.push(point(event));
    redraw();
  };
  const onUp = () => {
    current = null;
  };
  const onRecognize = async () => {
    if (!strokes.length) {
      status.textContent = t("drawFirst");
      return;
    }
    status.textContent = t("recognizing");
    try {
      const active = await ensureEngine();
      const text = await active.recognize(strokes, options.lang());
      if (!text) {
        status.textContent = t("nothingRecognized");
        return;
      }
      status.textContent = "";
      strokes.length = 0;
      redraw();
      options.onText(text);
    } catch {
      status.textContent = engine?.kind === "ocr" ? t("ocrFailed") : t("nothingRecognized");
    }
  };
  const onUndo = () => {
    strokes.pop();
    redraw();
  };
  const clear = () => {
    strokes.length = 0;
    status.textContent = "";
    redraw();
  };
  const recognizeClick = () => void onRecognize();
  const undoBtn = q<HTMLButtonElement>("[data-write-undo]");
  const clearBtn = q<HTMLButtonElement>("[data-write-clear]");
  const recognizeBtn = q<HTMLButtonElement>("[data-write-recognize]");
  pad.addEventListener("pointerdown", onDown);
  pad.addEventListener("pointermove", onMove);
  pad.addEventListener("pointerup", onUp);
  pad.addEventListener("pointercancel", onUp);
  undoBtn.addEventListener("click", onUndo);
  clearBtn.addEventListener("click", clear);
  recognizeBtn.addEventListener("click", recognizeClick);
  applyI18n(container);
  void ensureEngine();

  return {
    redraw: () => {
      redraw();
      void ensureEngine();
    },
    clear,
    destroy() {
      pad.removeEventListener("pointerdown", onDown);
      pad.removeEventListener("pointermove", onMove);
      pad.removeEventListener("pointerup", onUp);
      pad.removeEventListener("pointercancel", onUp);
      undoBtn.removeEventListener("click", onUndo);
      clearBtn.removeEventListener("click", clear);
      recognizeBtn.removeEventListener("click", recognizeClick);
      container.innerHTML = "";
    },
  };
}
