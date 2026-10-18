import { applyI18n } from "../i18n";
import type { Lang } from "../types";
import { mountPhotoPanel, type PhotoPanel } from "./photo-panel";
import { mountWritePanel, type WritePanel } from "./write-panel";

/**
 * One "⋯ More" button under Type + Send in a room. Its sheet holds Write and
 * Photo; both end in the same Type + Send form, so the one-speaker floor, the
 * PIN gate and the translator chain behave exactly as for typed captions.
 */
export type MoreMenuOptions = {
  /** Element the ⋯ More button goes in. */
  bar: HTMLElement;
  dialogHost: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  lang: () => Lang;
  translate: (text: string, from: Lang) => Promise<Record<Lang, string>>;
};

type Tab = "write" | "photo";

const MORE_DIALOG_HTML = `
  <dialog class="send-tv-dialog extra-dialog" data-more-dialog aria-labelledby="more-title">
    <div class="send-tv-sheet">
      <header class="send-tv-head">
        <h2 id="more-title" data-i18n="moreTitle"></h2>
        <button class="ghost send-tv-close" data-more-close type="button" data-i18n="close"></button>
      </header>
      <div class="chips more-tabs" role="tablist">
        <button class="chip" type="button" role="tab" data-more-tab="write" aria-selected="false">✍️ <span data-i18n="writeBtn"></span></button>
        <button class="chip" type="button" role="tab" data-more-tab="photo" aria-selected="false">📷 <span data-i18n="photoBtn"></span></button>
      </div>
      <section data-more-panel="write" role="tabpanel" hidden>
        <div data-write-host></div>
        <div class="typed-caption write-result">
          <input data-write-result autocomplete="off" />
          <button class="primary" data-write-use type="button" data-i18n="useText"></button>
        </div>
      </section>
      <section data-more-panel="photo" role="tabpanel" hidden>
        <div data-photo-host></div>
      </section>
    </div>
  </dialog>
`;

export function mountMoreMenu(options: MoreMenuOptions): () => void {
  const { bar, form, input } = options;
  bar.innerHTML = `<button class="ghost more-btn" data-more-open type="button" aria-haspopup="dialog" data-i18n-aria="moreAria">⋯ <span data-i18n="moreBtn"></span></button>`;
  const holder = document.createElement("div");
  holder.innerHTML = MORE_DIALOG_HTML;
  options.dialogHost.append(holder);
  const q = <T extends Element>(sel: string) => holder.querySelector(sel) as T;
  const dialog = q<HTMLDialogElement>("[data-more-dialog]");
  const writeResult = q<HTMLInputElement>("[data-write-result]");
  let write: WritePanel | null = null;
  let photo: PhotoPanel | null = null;
  let tab: Tab = "write";

  const close = () => {
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  };

  const showTab = (next: Tab) => {
    tab = next;
    for (const btn of holder.querySelectorAll<HTMLButtonElement>("[data-more-tab]")) {
      const on = btn.dataset.moreTab === tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", String(on));
    }
    for (const panel of holder.querySelectorAll<HTMLElement>("[data-more-panel]")) {
      panel.hidden = panel.dataset.morePanel !== tab;
    }
    // Panels mount on first use: tesseract.js and the recognizer stay unloaded until then.
    if (tab === "write") {
      write ??= mountWritePanel(q("[data-write-host]"), {
        lang: options.lang,
        onText: (text) => {
          writeResult.value = writeResult.value ? `${writeResult.value} ${text}` : text;
        },
        onClear: () => {
          writeResult.value = "";
        },
      });
      requestAnimationFrame(() => write?.redraw());
    } else {
      photo ??= mountPhotoPanel(q("[data-photo-host]"), {
        lang: options.lang,
        translate: options.translate,
        onPost: (text, lang) => {
          input.value = text;
          // Type + Send files it under the photo's language, not the Spoken chip.
          form.dataset.langHint = lang;
          close();
          form.requestSubmit();
        },
      });
    }
  };

  const onOpen = () => {
    applyI18n(holder);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    showTab(tab);
  };
  const onTab = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-more-tab]");
    const next = btn?.dataset.moreTab;
    if (next === "write" || next === "photo") showTab(next);
  };
  const onUse = () => {
    const text = writeResult.value.trim();
    if (!text) return;
    input.value = input.value.trim() ? `${input.value.trim()} ${text}` : text;
    writeResult.value = "";
    write?.clear();
    close();
    input.focus();
  };
  const onBackdrop = (event: Event) => {
    if (event.target === dialog) close();
  };

  const openBtn = bar.querySelector("[data-more-open]") as HTMLButtonElement;
  const closeBtn = q<HTMLButtonElement>("[data-more-close]");
  const tabs = q<HTMLElement>(".more-tabs");
  const useBtn = q<HTMLButtonElement>("[data-write-use]");
  openBtn.addEventListener("click", onOpen);
  closeBtn.addEventListener("click", close);
  tabs.addEventListener("click", onTab);
  useBtn.addEventListener("click", onUse);
  dialog.addEventListener("click", onBackdrop);

  return () => {
    openBtn.removeEventListener("click", onOpen);
    closeBtn.removeEventListener("click", close);
    tabs.removeEventListener("click", onTab);
    useBtn.removeEventListener("click", onUse);
    dialog.removeEventListener("click", onBackdrop);
    close();
    write?.destroy();
    photo?.destroy();
    holder.remove();
  };
}
