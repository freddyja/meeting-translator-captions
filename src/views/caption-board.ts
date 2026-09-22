import { finalizedLines } from "../caption-history.ts";
import { escapeHtml } from "../dom.ts";
import {
  LANG_LABEL,
  LANG_SHORT,
  langsForLayout,
  sanitizePeerName,
  type CaptionLine,
  type Lang,
  type RoomState,
} from "../types.ts";

export type LiveCaption = {
  text: string;
  sourceLang: Lang;
  speaker?: string;
};

export type CaptionBoardState = Pick<RoomState, "layout" | "lines"> &
  Partial<Pick<RoomState, "listening" | "floor">>;

function lineClass(index: number, total: number, hasLive: boolean): string {
  if (index === total - 1 && !hasLive) return "line";
  return "line faded";
}

function speakerOf(value: unknown): string {
  return sanitizePeerName(value, "");
}

function renderSpoken(speaker: string, text: string, className: string): string {
  const name = speaker ? `<span class="line-speaker">${escapeHtml(speaker)}</span>` : "";
  const body = text ? `<span class="line-text">${escapeHtml(text)}</span>` : "";
  if (!name && !body) return "";
  return `<p class="${className}">${name}${body}</p>`;
}

function renderWindow(lang: Lang, lines: CaptionLine[], live: LiveCaption | null | undefined, state: CaptionBoardState): string {
  const visible = finalizedLines(lines).filter((line) => line.text[lang]?.trim());
  const liveText = live?.text.trim() ?? "";
  const active = speakerOf(live?.speaker) || speakerOf(state.floor?.holderName);
  const lastSpeaker = speakerOf(visible.at(-1)?.speaker);
  const floorChanged = Boolean(active && active !== lastSpeaker);
  const history =
    visible.length === 0
      ? ""
      : visible
          .map((line, index) => {
            const name = speakerOf(line.speaker);
            return renderSpoken(name, line.text[lang], lineClass(index, visible.length, Boolean(liveText)));
          })
          .join("");
  let extra = "";
  if (liveText) {
    const draft = lang === live?.sourceLang ? liveText : "Listening…";
    extra = renderSpoken(active, draft, "line interim");
  } else if (floorChanged) {
    extra = renderSpoken(active, state.listening ? "Listening…" : "", "line speaker-live");
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

export function renderCaptionBoard(
  state: CaptionBoardState,
  live?: LiveCaption | null,
  langs?: readonly Lang[],
): { shown: Lang[]; html: string } {
  const shown = langs?.length ? [...langs] : langsForLayout(state.layout);
  const html = shown.map((lang) => renderWindow(lang, state.lines ?? [], live, state)).join("");
  return { shown, html };
}

export function paintCaptionBoard(
  board: HTMLElement,
  state: CaptionBoardState,
  live?: LiveCaption | null,
  langs?: readonly Lang[],
): Lang[] {
  const { shown, html } = renderCaptionBoard(state, live, langs);
  board.dataset.count = String(shown.length);
  board.dataset.layout = state.layout;
  board.innerHTML = html;
  return shown;
}
