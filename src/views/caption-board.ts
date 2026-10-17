import { finalizedLines } from "../caption-history.ts";
import { escapeHtml } from "../dom.ts";
import { displaySpeaker, t } from "../i18n.ts";
import { detectLang } from "../translate/detect.ts";
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
  /** Pane for this mic draft. Set by the speech path so detection cannot move it. */
  draftLang?: Lang;
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

function renderWindow(
  lang: Lang,
  lines: CaptionLine[],
  live: LiveCaption | null | undefined,
  state: CaptionBoardState,
  draftLang: Lang | null,
): string {
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
            const name = displaySpeaker(speakerOf(line.speaker));
            return renderSpoken(name, line.text[lang], lineClass(index, visible.length, Boolean(liveText)));
          })
          .join("");
  let extra = "";
  if (liveText) {
    const draft = lang === draftLang ? liveText : t("listeningEllipsis");
    extra = renderSpoken(displaySpeaker(active), draft, "line interim");
  } else if (floorChanged) {
    extra = renderSpoken(displaySpeaker(active), state.listening ? t("listeningEllipsis") : "", "line speaker-live");
  } else if (visible.length === 0) {
    extra = `<p class="empty-caption">${escapeHtml(t("waitingSpeech"))}</p>`;
  }
  return `
    <section class="window" data-lang="${lang}" lang="${lang}">
      <h2 class="window-label">${LANG_SHORT[lang]} · ${LANG_LABEL[lang]}</h2>
      <div class="lines" data-lines="${lang}">${history}${extra}</div>
      <button class="new-captions-pill" type="button" data-new-captions="${lang}" hidden>${escapeHtml(t("newCaptions"))}</button>
    </section>
  `;
}

export function renderCaptionBoard(
  state: CaptionBoardState,
  live?: LiveCaption | null,
  langs?: readonly Lang[],
): { shown: Lang[]; html: string } {
  const shown = langs?.length ? [...langs] : langsForLayout(state.layout);
  const liveText = live?.text.trim() ?? "";
  const draftLang = liveText && live ? (live.draftLang ?? detectLang(liveText, live.sourceLang)) : null;
  const html = shown.map((lang) => renderWindow(lang, state.lines ?? [], live, state, draftLang)).join("");
  return { shown, html };
}

export function paintCaptionBoard(
  board: HTMLElement,
  state: CaptionBoardState,
  live?: LiveCaption | null,
  langs?: readonly Lang[],
): Lang[] {
  const { shown, html } = renderCaptionBoard(state, live, langs);
  const before = readPanes(board);
  board.dataset.count = String(shown.length);
  board.dataset.layout = state.layout;
  board.innerHTML = html;
  restorePanes(board, before);
  bindPills(board);
  return shown;
}

/** Within this many px of the bottom counts as following the live captions. */
const FOLLOW_SLOP_PX = 12;

type PaneMemory = { html: string; unseen: boolean };
const memory = new WeakMap<HTMLElement, Map<string, PaneMemory>>();
const bound = new WeakSet<HTMLElement>();

export function isScrolledUp(el: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight > FOLLOW_SLOP_PX;
}

/**
 * Pill state for one pane after a repaint. Following readers never see it;
 * a reader scrolled up sees it once the pane content changes, until they return.
 */
export function nextPillState(prev: PaneMemory | undefined, html: string, scrolledUp: boolean): PaneMemory {
  if (!scrolledUp) return { html, unseen: false };
  const changed = prev !== undefined && prev.html !== html;
  return { html, unseen: Boolean(prev?.unseen) || changed };
}

type PaneView = { scrollTop: number; innerUp: boolean; pageUp: boolean };

/**
 * The newest line sits below the visible page (a phone reader scrolled the
 * page up, or the pane grew past the fold). Not used on the TV view, which no
 * one scrolls, so a wall display never shows the pill.
 */
function belowFold(el: HTMLElement): boolean {
  const view = globalThis.window;
  if (!view || el.closest(".tv-screen:not(.smart-view-captions)")) return false;
  return el.getBoundingClientRect().bottom - view.innerHeight > FOLLOW_SLOP_PX;
}

function readPanes(board: HTMLElement): Map<string, PaneView> {
  const out = new Map<string, PaneView>();
  for (const el of board.querySelectorAll<HTMLElement>("[data-lines]")) {
    out.set(el.dataset.lines ?? "", { scrollTop: el.scrollTop, innerUp: isScrolledUp(el), pageUp: belowFold(el) });
  }
  return out;
}

function restorePanes(board: HTMLElement, before: Map<string, PaneView>): void {
  let panes = memory.get(board);
  if (!panes) {
    panes = new Map();
    memory.set(board, panes);
  }
  for (const el of board.querySelectorAll<HTMLElement>("[data-lines]")) {
    const lang = el.dataset.lines ?? "";
    const was = before.get(lang);
    // Keep a reader's place inside a scrolled pane; otherwise follow the newest line.
    if (was?.innerUp) el.scrollTop = was.scrollTop;
    else el.scrollTop = el.scrollHeight;
    const next = nextPillState(panes.get(lang), el.innerHTML, Boolean(was?.innerUp || was?.pageUp));
    panes.set(lang, next);
    const pill = board.querySelector<HTMLElement>(`[data-new-captions="${lang}"]`);
    if (pill) pill.hidden = !next.unseen;
  }
}

function clearCaughtUp(board: HTMLElement): void {
  for (const el of board.querySelectorAll<HTMLElement>("[data-lines]")) {
    if (isScrolledUp(el) || belowFold(el)) continue;
    const lang = el.dataset.lines ?? "";
    const pane = memory.get(board)?.get(lang);
    if (pane) pane.unseen = false;
    const pill = board.querySelector<HTMLElement>(`[data-new-captions="${lang}"]`);
    if (pill) pill.hidden = true;
  }
}

function bindPills(board: HTMLElement): void {
  if (bound.has(board)) return;
  bound.add(board);
  board.addEventListener("click", (event) => {
    const pill = (event.target as HTMLElement).closest<HTMLElement>("[data-new-captions]");
    if (!pill) return;
    const lang = pill.dataset.newCaptions ?? "";
    const lines = board.querySelector<HTMLElement>(`[data-lines="${lang}"]`);
    if (lines) {
      lines.scrollTo({ top: lines.scrollHeight, behavior: "smooth" });
      lines.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
    pill.hidden = true;
    const pane = memory.get(board)?.get(lang);
    if (pane) pane.unseen = false;
  });
  // Pane scroll does not bubble; listen in the capture phase.
  board.addEventListener("scroll", () => clearCaughtUp(board), true);
  const onPageScroll = () => {
    if (!board.isConnected) {
      globalThis.window?.removeEventListener("scroll", onPageScroll);
      return;
    }
    clearCaughtUp(board);
  };
  globalThis.window?.addEventListener("scroll", onPageScroll, { passive: true });
}
