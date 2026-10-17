import { escapeHtml } from "../dom";
import { t } from "../i18n";
import { detectLang } from "../translate/detect";
import { LANG_LABEL, LANG_SHORT, LANGS, type Lang } from "../types";
import {
  createOcrHandwritingEngine,
  pickHandwritingEngine,
  type HandwritingEngine,
  type Stroke,
} from "./handwriting";
import { cleanOcrText, tesseractOcr, type OcrChoice, type OcrEngine } from "./ocr";

/**
 * Write (finger handwriting) and Photo (camera translate) beside Type + Send.
 * Both end in the same Type + Send form, so the one-speaker floor, the PIN
 * gate and the translator chain behave exactly as for typed captions.
 */
export type ExtraInputsOptions = {
  /** Element the Write / Photo buttons go in (right after the Type + Send form). */
  bar: HTMLElement;
  /** Where the two dialogs are appended. */
  dialogHost: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  /** Spoken language: handwriting model and the default photo language. */
  lang: () => Lang;
  translate: (text: string, from: Lang) => Promise<Record<Lang, string>>;
  ocr?: OcrEngine;
};

export const EXTRA_INPUTS_HTML = `
  <button class="ghost extra-input-btn" data-write-open type="button" aria-haspopup="dialog" data-i18n-aria="writeAria">✍️ <span data-i18n="writeBtn"></span></button>
  <button class="ghost extra-input-btn" data-photo-open type="button" aria-haspopup="dialog" data-i18n-aria="photoAria">📷 <span data-i18n="photoBtn"></span></button>
`;

const DIALOGS_HTML = `
  <dialog class="send-tv-dialog extra-dialog" data-write-dialog aria-labelledby="write-title">
    <div class="send-tv-sheet">
      <header class="send-tv-head">
        <h2 id="write-title" data-i18n="writeTitle"></h2>
        <button class="ghost send-tv-close" data-write-close type="button" data-i18n="close"></button>
      </header>
      <p class="hint" data-write-hint></p>
      <canvas class="write-pad" data-write-pad aria-describedby="write-title"></canvas>
      <div class="row-actions write-actions">
        <button class="ghost" data-write-undo type="button" data-i18n="undoStroke"></button>
        <button class="ghost" data-write-clear type="button" data-i18n="clearDrawing"></button>
        <button class="primary" data-write-recognize type="button" data-i18n="recognize"></button>
      </div>
      <p class="hint" data-write-status role="status" aria-live="polite"></p>
      <div class="typed-caption write-result">
        <input data-write-result autocomplete="off" />
        <button class="primary" data-write-use type="button" data-i18n="useText"></button>
      </div>
    </div>
  </dialog>
  <dialog class="send-tv-dialog extra-dialog" data-photo-dialog aria-labelledby="photo-title">
    <div class="send-tv-sheet">
      <header class="send-tv-head">
        <h2 id="photo-title" data-i18n="photoTitle"></h2>
        <button class="ghost send-tv-close" data-photo-close type="button" data-i18n="close"></button>
      </header>
      <p class="control-label" data-i18n="photoTextLang"></p>
      <div class="chips" data-photo-langs role="group"></div>
      <div class="row-actions photo-pick">
        <label class="primary photo-pick-btn"><span data-i18n="takePhoto"></span><input data-photo-camera type="file" accept="image/*" capture="environment" hidden /></label>
        <label class="secondary photo-pick-btn"><span data-i18n="uploadPhoto"></span><input data-photo-file type="file" accept="image/*" hidden /></label>
      </div>
      <img class="photo-preview" data-photo-preview alt="" hidden />
      <p class="hint" data-photo-status role="status" aria-live="polite"></p>
      <div data-photo-result hidden>
        <p class="control-label" data-i18n="photoTextFound"></p>
        <textarea class="photo-text" data-photo-text rows="3"></textarea>
        <div class="photo-translations" data-photo-translations></div>
        <div class="row-actions">
          <button class="ghost" data-photo-retranslate type="button" data-i18n="retranslate"></button>
          <button class="primary" data-photo-post type="button" data-i18n="postCaption"></button>
        </div>
      </div>
    </div>
  </dialog>
`;

function openDialog(dialog: HTMLDialogElement) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog: HTMLDialogElement) {
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

/** Downscale big phone photos: faster OCR, same accuracy for signs and pages. */
async function shrinkImage(file: Blob, maxSide = 1800): Promise<Blob | HTMLCanvasElement> {
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas;
  } catch {
    return file;
  }
}

export function mountExtraInputs(options: ExtraInputsOptions): () => void {
  const { bar, form, input } = options;
  const ocr = options.ocr ?? tesseractOcr;
  bar.innerHTML = EXTRA_INPUTS_HTML;
  const holder = document.createElement("div");
  holder.innerHTML = DIALOGS_HTML;
  options.dialogHost.append(holder);
  const q = <T extends Element>(sel: string) => holder.querySelector(sel) as T;

  // ---------- Write ----------
  const writeDialog = q<HTMLDialogElement>("[data-write-dialog]");
  const pad = q<HTMLCanvasElement>("[data-write-pad]");
  const writeHint = q<HTMLElement>("[data-write-hint]");
  const writeStatus = q<HTMLElement>("[data-write-status]");
  const writeResult = q<HTMLInputElement>("[data-write-result]");
  const strokes: Stroke[] = [];
  let current: Stroke | null = null;
  let engine: HandwritingEngine | null = null;
  let engineLang: Lang | null = null;
  const fallbackEngine = createOcrHandwritingEngine(ocr);

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

  const ensureEngine = async () => {
    const lang = options.lang();
    if (!engine || engineLang !== lang) {
      engine = await pickHandwritingEngine(lang, fallbackEngine);
      engineLang = lang;
    }
    writeHint.textContent = engine.kind === "native" ? t("writeHintNative") : t("writeHintOcr");
    writeHint.dataset.engine = engine.kind;
    return engine;
  };

  const onWriteOpen = () => {
    writeStatus.textContent = "";
    openDialog(writeDialog);
    requestAnimationFrame(redraw);
    void ensureEngine();
  };
  const onRecognize = async () => {
    if (!strokes.length) {
      writeStatus.textContent = t("drawFirst");
      return;
    }
    writeStatus.textContent = t("recognizing");
    try {
      const active = await ensureEngine();
      const text = await active.recognize(strokes, options.lang());
      writeStatus.textContent = text ? "" : t("nothingRecognized");
      if (text) writeResult.value = writeResult.value ? `${writeResult.value} ${text}` : text;
      if (text) {
        strokes.length = 0;
        redraw();
      }
    } catch {
      writeStatus.textContent = engine?.kind === "ocr" ? t("ocrFailed") : t("nothingRecognized");
    }
  };
  const onUse = () => {
    const text = writeResult.value.trim();
    if (!text) return;
    input.value = input.value.trim() ? `${input.value.trim()} ${text}` : text;
    writeResult.value = "";
    strokes.length = 0;
    closeDialog(writeDialog);
    input.focus();
  };
  const onUndo = () => {
    strokes.pop();
    redraw();
  };
  const onClearPad = () => {
    strokes.length = 0;
    writeResult.value = "";
    writeStatus.textContent = "";
    redraw();
  };

  // ---------- Photo ----------
  const photoDialog = q<HTMLDialogElement>("[data-photo-dialog]");
  const langBox = q<HTMLElement>("[data-photo-langs]");
  const preview = q<HTMLImageElement>("[data-photo-preview]");
  const photoStatus = q<HTMLElement>("[data-photo-status]");
  const resultBox = q<HTMLElement>("[data-photo-result]");
  const photoText = q<HTMLTextAreaElement>("[data-photo-text]");
  const translationsBox = q<HTMLElement>("[data-photo-translations]");
  let photoLang: OcrChoice = "auto";
  let previewUrl = "";
  let runToken = 0;

  const paintLangChips = () => {
    const choices: OcrChoice[] = [...LANGS, "auto"];
    langBox.innerHTML = choices
      .map((choice) => {
        const label = choice === "auto" ? t("photoAuto") : `${LANG_SHORT[choice]} ${LANG_LABEL[choice]}`;
        const on = choice === photoLang;
        return `<button class="chip${on ? " active" : ""}" type="button" data-photo-lang="${choice}" aria-pressed="${on}">${escapeHtml(label)}</button>`;
      })
      .join("");
  };

  const sourceFor = (text: string): Lang => (photoLang === "auto" ? detectLang(text, options.lang()) : photoLang);

  const paintTranslations = (rows: Record<Lang, string> | null) => {
    translationsBox.innerHTML = rows
      ? LANGS.map(
          (lang) => `
            <article class="photo-translation" lang="${lang}">
              <p class="control-label">${LANG_SHORT[lang]} · ${escapeHtml(LANG_LABEL[lang])}</p>
              <p>${escapeHtml(rows[lang] ?? "")}</p>
            </article>`,
        ).join("")
      : `<p class="hint">${escapeHtml(t("translatingEllipsis"))}</p>`;
  };

  const translateText = async () => {
    const text = photoText.value.trim();
    if (!text) return;
    const token = ++runToken;
    paintTranslations(null);
    try {
      const rows = await options.translate(text, sourceFor(text));
      if (token === runToken) paintTranslations(rows);
    } catch {
      if (token === runToken) translationsBox.innerHTML = "";
    }
  };

  const onPhoto = async (event: Event) => {
    const picker = event.target as HTMLInputElement;
    const file = picker.files?.[0];
    picker.value = "";
    if (!file) return;
    const token = ++runToken;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
    resultBox.hidden = true;
    photoStatus.textContent = t("ocrLoading");
    try {
      const image = await shrinkImage(file);
      const { text } = await ocr(image, photoLang, (status, pct) => {
        if (token !== runToken) return;
        photoStatus.textContent = status === "reading" ? t("ocrReading", { pct }) : t("ocrLoading");
      });
      if (token !== runToken) return;
      const clean = cleanOcrText(text);
      if (!clean) {
        photoStatus.textContent = t("ocrNoText");
        return;
      }
      photoStatus.textContent = "";
      photoText.value = clean;
      resultBox.hidden = false;
      await translateText();
    } catch {
      if (token === runToken) photoStatus.textContent = t("ocrFailed");
    }
  };

  const onPhotoOpen = () => {
    photoLang = photoLang === "auto" ? "auto" : options.lang();
    paintLangChips();
    openDialog(photoDialog);
  };
  const onLangChip = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-photo-lang]");
    const next = btn?.dataset.photoLang as OcrChoice | undefined;
    if (!next) return;
    photoLang = next;
    paintLangChips();
  };
  const onPost = () => {
    const text = photoText.value.trim();
    if (!text) return;
    input.value = text;
    closeDialog(photoDialog);
    form.requestSubmit();
    photoStatus.textContent = t("postedCaption");
  };

  const writeOpen = bar.querySelector("[data-write-open]") as HTMLButtonElement;
  const photoOpen = bar.querySelector("[data-photo-open]") as HTMLButtonElement;
  const closeWrite = () => closeDialog(writeDialog);
  const closePhoto = () => closeDialog(photoDialog);
  const backdrop = (dialog: HTMLDialogElement) => (event: Event) => {
    if (event.target === dialog) closeDialog(dialog);
  };
  const writeBackdrop = backdrop(writeDialog);
  const photoBackdrop = backdrop(photoDialog);
  const listeners: Array<[EventTarget, string, EventListener]> = [
    [writeOpen, "click", onWriteOpen],
    [photoOpen, "click", onPhotoOpen],
    [q("[data-write-close]"), "click", closeWrite],
    [q("[data-photo-close]"), "click", closePhoto],
    [writeDialog, "click", writeBackdrop],
    [photoDialog, "click", photoBackdrop],
    [pad, "pointerdown", onDown as EventListener],
    [pad, "pointermove", onMove as EventListener],
    [pad, "pointerup", onUp],
    [pad, "pointercancel", onUp],
    [q("[data-write-recognize]"), "click", () => void onRecognize()],
    [q("[data-write-use]"), "click", onUse],
    [q("[data-write-undo]"), "click", onUndo],
    [q("[data-write-clear]"), "click", onClearPad],
    [q("[data-photo-camera]"), "change", (e) => void onPhoto(e)],
    [q("[data-photo-file]"), "change", (e) => void onPhoto(e)],
    [langBox, "click", onLangChip],
    [q("[data-photo-retranslate]"), "click", () => void translateText()],
    [q("[data-photo-post]"), "click", onPost],
  ];
  for (const [target, type, fn] of listeners) target.addEventListener(type, fn);
  paintLangChips();

  return () => {
    for (const [target, type, fn] of listeners) target.removeEventListener(type, fn);
    closeWrite();
    closePhoto();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    holder.remove();
  };
}
