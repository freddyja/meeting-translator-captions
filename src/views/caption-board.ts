import { finalizedLines } from "../caption-history";
import { escapeHtml } from "../dom";
import { LANG_LABEL, LANG_SHORT, langsForLayout, type CaptionLine, type Lang, type RoomState } from "../types";

export type LiveCaption = {
  text: string;
  sourceLang: Lang;
};

function lineClass(index: number, total: number, hasLive: boolean): string {
  if (index === total - 1 && !hasLive) return "line";
  return "line faded";
}

function renderWindow(lang: Lang, lines: CaptionLine[], live?: LiveCaption | null): string {
  const visible = finalizedLines(lines).filter((line) => line.text[lang]?.trim());
  const liveText = live?.text.trim() ?? "";
  const history =
    visible.length === 0
      ? ""
      : visible
          .map(
            (line, index) =>
              `<p class="${lineClass(index, visible.length, Boolean(liveText))}">${escapeHtml(line.text[lang])}</p>`,
          )
          .join("");
  let extra = "";
  if (liveText) {
    const draft = lang === live?.sourceLang ? liveText : "Listening…";
    extra = `<p class="line interim">${escapeHtml(draft)}</p>`;
  } else if (visible.length === 0) {
    extra = `<p class="empty-caption">Waiting for live speech…</p>`;
  }
  return `
    <section class="window" data-lang="${lang}" lang="${lang}">
      <h2 class="window-label">${LANG_SHORT[lang]} · ${LANG_LABEL[lang]}</h2>
      <div class="lines">${history}${extra}</div>
    </section>
  `;
}

export function paintCaptionBoard(
  board: HTMLElement,
  state: Pick<RoomState, "layout" | "lines">,
  live?: LiveCaption | null,
): Lang[] {
  const langs = langsForLayout(state.layout);
  board.dataset.count = String(langs.length);
  board.dataset.layout = state.layout;
  board.innerHTML = langs.map((lang) => renderWindow(lang, state.lines, live)).join("");
  return langs;
}
