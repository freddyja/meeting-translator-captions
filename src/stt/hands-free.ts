import { neutralLang } from "../translate/detect.ts";
import { isLang, type Lang } from "../types.ts";

/**
 * Hands-free two-person mode.
 *
 * Web Speech has no real language auto-detect: a recognizer listens in ONE
 * locale at a time (and on iPhone we may only ever change `lang` on the first
 * webkitSpeechRecognition object). So this mode is honest turn-taking:
 *
 *  1. The mic listens in the current speaker's language (one of a fixed pair).
 *  2. Each final phrase is filed under the language its words support
 *     (detect step on the transcript, restricted to the pair). When the words
 *     are ambiguous the listening language stands.
 *  3. After a quiet gap the floor is released and the recognizer flips to the
 *     OTHER language of the pair, expecting the other person to answer.
 *
 * Limits: if the same person keeps talking after the gap, their next phrase is
 * heard in the other locale and is usually garbled; the detect step only
 * re-files clear text, it cannot re-transcribe audio. Tap ⇄ to correct.
 */
export const HANDS_FREE_SILENCE_MS = 1600;

export type LangPair = readonly [Lang, Lang];

/** Spoken + a different single Watch language; otherwise Spoken + English (or Spanish when Spoken is English). */
export function handsFreePair(spoken: Lang, watch: string): LangPair {
  if (isLang(watch) && watch !== spoken) return [spoken, watch];
  return [spoken, spoken === "en" ? "es" : "en"];
}

export function otherLang(lang: Lang, pair: LangPair): Lang {
  return lang === pair[0] ? pair[1] : pair[0];
}

/** Pane for one finished phrase: the detected language when it is in the pair, else the listening language. */
export function utteranceLang(text: string, listening: Lang, pair: LangPair): Lang {
  const guess = neutralLang(text);
  return guess && pair.includes(guess) ? guess : listening;
}

export type HandsFreeTurnsOptions = {
  pair: LangPair;
  /** Language the recognizer is listening in right now. */
  listening: Lang;
  silenceMs?: number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  /** Quiet after a phrase: release the floor and listen for the other person. */
  onTurnEnd: (nextLang: Lang) => void;
};

export type HandsFreeTurns = {
  readonly pair: LangPair;
  readonly listening: Lang;
  /** Any interim or final. Returns the pane for a final, undefined for an interim. */
  heard(text: string, isFinal: boolean): Lang | undefined;
  /** Manual switch (⇄ or a Spoken chip): listen in `lang` now, no pending turn end. */
  listenIn(lang: Lang): void;
  stop(): void;
};

export function createHandsFreeTurns(options: HandsFreeTurnsOptions): HandsFreeTurns {
  const silenceMs = options.silenceMs ?? HANDS_FREE_SILENCE_MS;
  const setTimer = options.setTimer ?? ((run, ms) => globalThis.setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((id) => globalThis.clearTimeout(id as number));
  const pair = options.pair;
  let listening: Lang = pair.includes(options.listening) ? options.listening : pair[0];
  let lastPhraseLang: Lang | null = null;
  let timer: unknown = null;
  let stopped = false;

  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const arm = () => {
    cancel();
    if (lastPhraseLang === null) return;
    timer = setTimer(() => {
      timer = null;
      if (stopped || lastPhraseLang === null) return;
      const next = otherLang(lastPhraseLang, pair);
      lastPhraseLang = null;
      listening = next;
      options.onTurnEnd(next);
    }, silenceMs);
  };

  return {
    pair,
    get listening() {
      return listening;
    },
    heard(text, isFinal) {
      if (stopped) return undefined;
      if (!isFinal) {
        // Still talking: hold the turn open.
        if (text.trim() && timer !== null) arm();
        return undefined;
      }
      const spoken = text.trim();
      if (!spoken) return undefined;
      const lang = utteranceLang(spoken, listening, pair);
      lastPhraseLang = lang;
      arm();
      return lang;
    },
    listenIn(lang) {
      cancel();
      lastPhraseLang = null;
      listening = lang;
    },
    stop() {
      stopped = true;
      cancel();
    },
  };
}
