import type { TalkLine } from "./talk-lines.ts";
import type { Lang } from "./types.ts";

/**
 * One bubble per spoken utterance on the Two-person conversation page.
 *
 * The recognizer reports many results for one sentence: interims, finals that
 * a stalled-interim commit published early, and (iOS Safari) the same or a
 * longer final again after the one-shot session ends and restarts. Keying a
 * bubble on each final made one sentence into several bubbles. Here the page
 * owns an utterance id instead: every result is merged into the open
 * utterance until the turn ends (silence/flip, speaker change) or a final is
 * followed by speech that does not continue it.
 */

/** Wait this long after the last interim before translating it. */
export const TALK_TRANSLATE_DEBOUNCE_MS = 500;
/**
 * After a turn ends, a result that only repeats or extends the closed
 * utterance (iOS commits its draft when the locale flips) still belongs to it.
 */
export const TALK_REEMIT_GRACE_MS = 2500;

export type MergeKind = "same" | "extend" | "overlap" | "revise" | "unrelated";

type Token = { raw: string; norm: string };

function tokens(text: string): Token[] {
  return text
    .trim()
    .split(/\s+/)
    .map((raw) => ({ raw, norm: raw.toLocaleLowerCase().replace(/[^\p{L}\p{N}']+/gu, "") }))
    .filter((token) => token.norm.length > 0);
}

function startsWith(list: string[], prefix: string[]): boolean {
  if (prefix.length > list.length) return false;
  return prefix.every((word, i) => list[i] === word);
}

function indexOfRun(list: string[], run: string[]): number {
  if (!run.length || run.length > list.length) return -1;
  for (let i = 0; i + run.length <= list.length; i += 1) {
    if (run.every((word, j) => list[i + j] === word)) return i;
  }
  return -1;
}

/**
 * How `next` relates to `prev` (word-wise, case and punctuation ignored), and
 * the merged text:
 * - same: a duplicate, or a shorter re-emit already inside prev. Keeps prev
 *   (or next when it is the same words with better punctuation).
 * - extend: next continues prev (prev is its prefix, or sits inside it).
 * - overlap: next starts with prev's last words (iOS restart re-emits a tail).
 * - revise: the recognizer re-recognized the same start differently.
 * - unrelated: new speech.
 */
export function mergeTranscript(prev: string, next: string): { kind: MergeKind; text: string } {
  const before = prev.trim();
  const after = next.trim();
  const p = tokens(before);
  const n = tokens(after);
  if (!n.length) return { kind: "same", text: before };
  if (!p.length) return { kind: "extend", text: after };
  const pw = p.map((t) => t.norm);
  const nw = n.map((t) => t.norm);
  if (pw.length === nw.length && startsWith(pw, nw)) return { kind: "same", text: after.length >= before.length ? after : before };
  if (startsWith(nw, pw) || indexOfRun(nw, pw) >= 0) return { kind: "extend", text: after };
  if (indexOfRun(pw, nw) >= 0) return { kind: "same", text: before };
  // Tail of prev == head of next: append only the new words.
  for (let k = Math.min(pw.length, nw.length - 1); k >= 2; k -= 1) {
    if (startsWith(nw, pw.slice(pw.length - k))) {
      const rest = n.slice(k).map((t) => t.raw).join(" ");
      return { kind: "overlap", text: `${before} ${rest}` };
    }
  }
  let common = 0;
  while (common < pw.length && common < nw.length && pw[common] === nw[common]) common += 1;
  if (common >= 2 && common >= Math.ceil(Math.min(pw.length, nw.length) / 2)) return { kind: "revise", text: after };
  return { kind: "unrelated", text: after };
}

export type Utterance = {
  readonly id: number;
  lang: Lang;
  /** Merged final text so far ("" until the first final). */
  committed: string;
  /** Latest interim, merged over committed for display. */
  interim: string;
  /** Text shown in the bubble. */
  text: string;
  /** At least one final arrived. */
  final: boolean;
  closed: boolean;
  closedAt: number;
};

export type UtteranceUpdate = {
  utterance: Utterance;
  /** A new bubble. */
  created: boolean;
  /** The bubble text changed. */
  changed: boolean;
  /** A late repeat/extension of the utterance whose turn already ended. */
  reemit: boolean;
};

export type UtteranceTracker = {
  readonly open: Utterance | null;
  /** One recognizer result. Empty text returns null. */
  heard(text: string, isFinal: boolean, lang: Lang): UtteranceUpdate | null;
  /** Turn over (silence/flip, speaker change, stop): the next words start a new bubble. */
  close(): void;
  reset(): void;
};

export function createUtteranceTracker(options: { now?: () => number; graceMs?: number } = {}): UtteranceTracker {
  const now = options.now ?? (() => Date.now());
  const graceMs = options.graceMs ?? TALK_REEMIT_GRACE_MS;
  let nextId = 1;
  let open: Utterance | null = null;
  let lastClosed: Utterance | null = null;

  const display = (u: Utterance) => (u.interim ? mergeTranscript(u.committed, u.interim).text : u.committed);

  const closeOpen = () => {
    if (!open) return;
    open.closed = true;
    open.closedAt = now();
    open.interim = "";
    open.text = open.committed || open.text;
    lastClosed = open;
    open = null;
  };

  const apply = (u: Utterance, text: string, isFinal: boolean): boolean => {
    const was = u.text;
    if (isFinal) {
      u.committed = u.committed ? mergeTranscript(u.committed, text).text : text;
      u.interim = "";
      u.final = true;
    } else {
      u.interim = text;
    }
    u.text = display(u);
    return u.text !== was;
  };

  return {
    get open() {
      return open;
    },
    heard(raw, isFinal, lang) {
      const text = raw.trim();
      if (!text) return null;
      if (open) {
        // A final followed by words that do not continue it: new speech.
        const fresh = open.final && mergeTranscript(open.committed, text).kind === "unrelated";
        if (!fresh) return { utterance: open, created: false, changed: apply(open, text, isFinal), reemit: false };
        closeOpen();
      } else if (lastClosed && now() - lastClosed.closedAt <= graceMs) {
        const kind = mergeTranscript(lastClosed.text, text).kind;
        if (kind === "same" || kind === "extend" || kind === "overlap") {
          // Only a final may grow a closed bubble; a repeated interim is dropped.
          const changed = isFinal ? apply(lastClosed, text, true) : false;
          return { utterance: lastClosed, created: false, changed, reemit: true };
        }
      }
      const utterance: Utterance = {
        id: nextId++,
        lang,
        committed: "",
        interim: "",
        text: "",
        final: false,
        closed: false,
        closedAt: 0,
      };
      apply(utterance, text, isFinal);
      open = utterance;
      return { utterance, created: true, changed: true, reemit: false };
    },
    close: closeOpen,
    reset() {
      open = null;
      lastClosed = null;
    },
  };
}

export type TalkTranscriptOptions = {
  translate: (text: string, from: Lang) => Promise<Record<Lang, string>>;
  onChange: () => void;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  debounceMs?: number;
  graceMs?: number;
  maxLines?: number;
};

export type TalkTranscript = {
  readonly lines: readonly TalkLine[];
  readonly tracker: UtteranceTracker;
  /** Feed one result. Returns the update so the page can run turn-taking on finals. */
  heard(text: string, isFinal: boolean, lang: Lang): UtteranceUpdate | null;
  /** The pair detector filed this utterance under another language. */
  refile(id: number, lang: Lang): void;
  close(): void;
  clear(): void;
  destroy(): void;
};

/**
 * Bubbles (TalkLine) for the page, keyed by utterance id. A line's original and
 * its translation update in place: interims translate after a debounce, a
 * final translates at once, and a late reply for older text is dropped.
 */
export function createTalkTranscript(options: TalkTranscriptOptions): TalkTranscript {
  const setTimer = options.setTimer ?? ((run, ms) => globalThis.setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((id) => globalThis.clearTimeout(id as number));
  const debounceMs = options.debounceMs ?? TALK_TRANSLATE_DEBOUNCE_MS;
  const maxLines = options.maxLines ?? 30;
  const tracker = createUtteranceTracker({ now: options.now, graceMs: options.graceMs });
  const lines: TalkLine[] = [];
  const jobs = new Map<number, { timer: unknown; token: number; done: string }>();
  let destroyed = false;

  const lineFor = (id: number) => lines.find((line) => line.id === id);

  const translateLine = (line: TalkLine, immediate: boolean) => {
    let job = jobs.get(line.id);
    if (!job) {
      job = { timer: null, token: 0, done: "" };
      jobs.set(line.id, job);
    }
    if (job.timer !== null) clearTimer(job.timer);
    job.timer = null;
    const run = () => {
      const current = jobs.get(line.id);
      if (!current || destroyed) return;
      current.timer = null;
      const key = `${line.lang}\u0000${line.original}`;
      if (key === current.done) return;
      const mine = ++current.token;
      const text = line.original;
      const from = line.lang;
      const settle = (rows: Record<Lang, string>) => {
        if (destroyed || mine !== current.token || jobs.get(line.id) !== current) return;
        current.done = key;
        line.rows = rows;
        options.onChange();
      };
      void options
        .translate(text, from)
        .then(settle)
        .catch(() => settle({ en: text, es: text, pt: text }));
    };
    if (immediate) run();
    else job.timer = setTimer(run, debounceMs);
  };

  const drop = (id: number) => {
    const job = jobs.get(id);
    if (job?.timer != null) clearTimer(job.timer);
    jobs.delete(id);
  };

  return {
    lines,
    tracker,
    heard(text, isFinal, lang) {
      const update = tracker.heard(text, isFinal, lang);
      if (!update) return null;
      const u = update.utterance;
      let line = lineFor(u.id);
      if (!line) {
        if (!update.created) return update; // cleared or scrolled off
        line = { id: u.id, lang: u.lang, original: u.text, rows: null, live: true };
        lines.push(line);
        while (lines.length > maxLines) drop(lines.shift()!.id);
      }
      line.original = u.text;
      line.lang = u.lang;
      line.live = !u.closed && !(isFinal && !u.interim);
      if (update.changed || isFinal) translateLine(line, isFinal);
      options.onChange();
      return update;
    },
    refile(id, lang) {
      const u = tracker.open?.id === id ? tracker.open : null;
      if (u) u.lang = lang;
      const line = lineFor(id);
      if (!line || line.lang === lang) return;
      line.lang = lang;
      translateLine(line, true);
      options.onChange();
    },
    close() {
      const id = tracker.open?.id;
      tracker.close();
      const line = id === undefined ? undefined : lineFor(id);
      if (line?.live) {
        line.live = false;
        // A turn that ended on an interim (no final) still gets its translation now.
        translateLine(line, true);
        options.onChange();
      }
    },
    clear() {
      for (const id of [...jobs.keys()]) drop(id);
      lines.length = 0;
      tracker.reset();
      options.onChange();
    },
    destroy() {
      destroyed = true;
      for (const id of [...jobs.keys()]) drop(id);
    },
  };
}
