import { escapeHtml } from "../dom";
import { applyI18n, t } from "../i18n";
import { detectLang } from "../translate/detect";
import { LANG_LABEL, LANG_SHORT, LANGS, type Lang } from "../types";
import { cleanOcrText, tesseractOcr, type OcrChoice, type OcrEngine } from "./ocr";

/**
 * Take or upload a photo → tesseract.js OCR (lazy, eng/spa/por) → editable text
 * → the normal translator chain → EN / ES / PT. With `onPost` (rooms only) a
 * Post as caption button hands the text to Type + Send.
 */
export type PhotoPanelOptions = {
  lang: () => Lang;
  translate: (text: string, from: Lang) => Promise<Record<Lang, string>>;
  /** Text plus the language it was read as (the photo chip, or detected for Auto). */
  onPost?: (text: string, lang: Lang) => void;
  ocr?: OcrEngine;
};

export type PhotoPanel = { repaint(): void; destroy(): void };

export function photoPanelHtml(withPost: boolean): string {
  return `
    <p class="control-label" data-i18n="photoTextLang"></p>
    <div class="chips" data-photo-langs role="group" data-i18n-aria="photoTextLang"></div>
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
        ${withPost ? `<button class="primary" data-photo-post type="button" data-i18n="postCaption"></button>` : ""}
      </div>
    </div>
  `;
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

export function translationRowsHtml(rows: Record<Lang, string>): string {
  return LANGS.map(
    (lang) => `
      <article class="photo-translation" lang="${lang}">
        <p class="control-label">${LANG_SHORT[lang]} · ${escapeHtml(LANG_LABEL[lang])}</p>
        <p data-translation="${lang}">${escapeHtml(rows[lang] ?? "")}</p>
      </article>`,
  ).join("");
}

export function mountPhotoPanel(container: HTMLElement, options: PhotoPanelOptions): PhotoPanel {
  const ocr = options.ocr ?? tesseractOcr;
  container.innerHTML = photoPanelHtml(Boolean(options.onPost));
  const q = <T extends Element>(sel: string) => container.querySelector(sel) as T;
  const langBox = q<HTMLElement>("[data-photo-langs]");
  const preview = q<HTMLImageElement>("[data-photo-preview]");
  const status = q<HTMLElement>("[data-photo-status]");
  const resultBox = q<HTMLElement>("[data-photo-result]");
  const textBox = q<HTMLTextAreaElement>("[data-photo-text]");
  const translations = q<HTMLElement>("[data-photo-translations]");
  let photoLang: OcrChoice = options.lang();
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

  const translateText = async () => {
    const text = textBox.value.trim();
    if (!text) return;
    const token = ++runToken;
    translations.innerHTML = `<p class="hint">${escapeHtml(t("translatingEllipsis"))}</p>`;
    try {
      const rows = await options.translate(text, sourceFor(text));
      if (token === runToken) translations.innerHTML = translationRowsHtml(rows);
    } catch {
      if (token === runToken) translations.innerHTML = "";
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
    status.textContent = t("ocrLoading");
    try {
      const image = await shrinkImage(file);
      const { text } = await ocr(image, photoLang, (phase, pct) => {
        if (token !== runToken) return;
        status.textContent = phase === "reading" ? t("ocrReading", { pct }) : t("ocrLoading");
      });
      if (token !== runToken) return;
      const clean = cleanOcrText(text);
      if (!clean) {
        status.textContent = t("ocrNoText");
        return;
      }
      status.textContent = "";
      textBox.value = clean;
      resultBox.hidden = false;
      await translateText();
    } catch {
      if (token === runToken) status.textContent = t("ocrFailed");
    }
  };
  const onLangChip = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-photo-lang]");
    const next = btn?.dataset.photoLang as OcrChoice | undefined;
    if (!next) return;
    photoLang = next;
    paintLangChips();
  };
  const onPost = () => {
    const text = textBox.value.trim();
    if (text) options.onPost?.(text, sourceFor(text));
  };
  const onRetranslate = () => void translateText();
  const onPick = (e: Event) => void onPhoto(e);

  const camera = q<HTMLInputElement>("[data-photo-camera]");
  const upload = q<HTMLInputElement>("[data-photo-file]");
  const retranslate = q<HTMLButtonElement>("[data-photo-retranslate]");
  const post = container.querySelector<HTMLButtonElement>("[data-photo-post]");
  camera.addEventListener("change", onPick);
  upload.addEventListener("change", onPick);
  langBox.addEventListener("click", onLangChip);
  retranslate.addEventListener("click", onRetranslate);
  post?.addEventListener("click", onPost);
  paintLangChips();
  applyI18n(container);

  return {
    repaint: paintLangChips,
    destroy() {
      camera.removeEventListener("change", onPick);
      upload.removeEventListener("change", onPick);
      langBox.removeEventListener("click", onLangChip);
      retranslate.removeEventListener("click", onRetranslate);
      post?.removeEventListener("click", onPost);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      container.innerHTML = "";
    },
  };
}
