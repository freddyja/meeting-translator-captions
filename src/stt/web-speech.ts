import { isAppleMobile } from "./capability.ts";

export type SpeechResult = {
  text: string;
  isFinal: boolean;
};

export type SpeechProvider = {
  readonly supported: boolean;
  start(): void;
  stop(): void;
  /**
   * `prime` creates the single iOS recognizer and writes `lang` now.
   * An idle call that only stores a string leaves that object, and `<html lang>`,
   * on English until start — Safari then does not hear es-ES or pt-BR.
   */
  setLang(locale: string, prime?: boolean): void;
  onResult: ((result: SpeechResult) => void) | null;
  onError: ((message: string) => void) | null;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0?: { transcript?: string };
  }>;
};

export type WebSpeechOptions = {
  /** When omitted, detected from the user agent. */
  appleMobile?: boolean;
  /** Injected in tests. Omitted means `webkitSpeechRecognition` / `SpeechRecognition`. */
  recognitionCtor?: RecognitionCtor | null;
  /** One-shot restart. Tests run this immediately instead of waiting on a timer. */
  scheduleRestart?: (run: () => void) => void;
  /**
   * iOS only: publish a stalled interim when Safari never fires `isFinal` or `onend`.
   * Return a timeout id so it can be cancelled. Tests invoke the callback themselves.
   */
  scheduleCommit?: (run: () => void) => number | void;
  /** Silent start (no onstart / result / end). Tests run this immediately. */
  scheduleWatchdog?: (run: () => void) => void;
};

/** How long an iPhone interim must sit unchanged before it is committed without `onend`. */
export const APPLE_UTTERANCE_COMMIT_MS = 1200;

/** How long to wait for Safari to acknowledge `start()` before telling the speaker to type. */
const APPLE_START_WATCHDOG_MS = 4000;

const IPHONE_TYPE =
  "iPhone couldn't capture speech. Type a caption — Send still reaches every phone and the TV.";

const IPHONE_NO_SPEECH =
  "iPhone heard nothing (no-speech). Type a caption — Send still reaches every phone and the TV.";

/** Shown when Safari fires `language-not-supported` for the locale we asked for. */
export function localeRejectedMessage(locale: string, code: string): string {
  return `Safari rejected ${locale} (${code}). Type a caption — Send still reaches every phone and the TV.`;
}

export function isSpeechFallbackMessage(message: string): boolean {
  return (
    message.includes("Type a caption") ||
    message.includes("Microphone blocked") ||
    message.includes("no Web Speech") ||
    message.includes("microphone stopped")
  );
}

/** A pause with no words. The mic stays up so the next phrase can still publish. */
export function isNonFatalSpeechNote(message: string): boolean {
  return message.includes("(no-speech)");
}

function alternativeTranscript(chunk: SpeechRecognitionResultEvent["results"][number]): string {
  const alternative = chunk[0];
  if (!alternative || typeof alternative.transcript !== "string") return "";
  return alternative.transcript.trim();
}

function alreadyStarted(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name: unknown }).name) : "";
  const message = err instanceof Error ? err.message : String(err);
  return name === "InvalidStateError" || /already started|invalidstate/i.test(`${name} ${message}`);
}

function getRecognitionCtor(apple: boolean): RecognitionCtor | null {
  const w = globalThis.window as
    | (Window & {
        SpeechRecognition?: RecognitionCtor;
        webkitSpeechRecognition?: RecognitionCtor;
      })
    | undefined;
  if (!w) return null;
  // iPhone keeps one webkitSpeechRecognition. Prefer that constructor when both exist.
  if (apple) return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function createWebSpeechProvider(options: WebSpeechOptions = {}): SpeechProvider {
  const apple = options.appleMobile ?? isAppleMobile();
  const Ctor = options.recognitionCtor === undefined ? getRecognitionCtor(apple) : options.recognitionCtor;
  const scheduleRestart =
    options.scheduleRestart ??
    ((run: () => void) => {
      globalThis.setTimeout(run, apple ? 200 : 120);
    });
  const scheduleCommit =
    options.scheduleCommit ??
    ((run: () => void) => globalThis.setTimeout(run, APPLE_UTTERANCE_COMMIT_MS));
  const scheduleWatchdog =
    options.scheduleWatchdog ??
    ((run: () => void) => {
      globalThis.setTimeout(run, APPLE_START_WATCHDOG_MS);
    });

  let rec: SpeechRecognitionLike | null = null;
  let locale = "en-US";
  let wantListening = false;
  let generation = 0;
  let commitToken = 0;
  let watchdogToken = 0;
  // Hoisted so no-speech can publish even if Safari never reaches onend.
  let draft = "";
  let lastCommitted = "";
  let aborting = false;
  let sessionAlive = false;

  const provider: SpeechProvider = {
    supported: Boolean(Ctor),
    onResult: null,
    onError: null,
    setLang(next, prime = false) {
      const localeNext = next.trim() || locale;
      const changed = localeNext !== locale;
      locale = localeNext;
      // WebKit reads the document language when SpeechRecognition.lang is still empty,
      // and ignores a later es-ES / pt-BR if the first object was born under English.
      if (apple) {
        syncDocumentLang();
        if (Ctor && (prime || rec)) {
          if (!rec) rec = new Ctor();
          rec.lang = locale;
        }
      }
      if (!changed || !wantListening) return;
      // Chrome ignores lang on a live recognizer, so rebuild in this tap.
      // iOS ignores lang on every object after the first. Keep that object.
      if (apple) reviveApple();
      else begin(true);
    },
    start() {
      if (!Ctor) {
        provider.onError?.("This browser has no Web Speech. Type a caption instead.");
        return;
      }
      wantListening = true;
      begin(true);
    },
    stop() {
      wantListening = false;
      generation += 1;
      cancelCommit();
      watchdogToken += 1;
      draft = "";
      lastCommitted = "";
      aborting = false;
      sessionAlive = false;
      const mine = rec;
      // Drop the desktop object. On iOS the next Start must reuse it or the
      // engine keeps the first session's language (English).
      if (!apple) rec = null;
      detachAndAbort(mine);
    },
  };

  function syncDocumentLang() {
    if (!apple) return;
    const root = globalThis.document?.documentElement;
    if (!root || root.lang === locale) return;
    root.lang = locale;
  }

  function cancelCommit() {
    commitToken += 1;
  }

  function commitDraft(): boolean {
    const text = draft.trim();
    draft = "";
    cancelCommit();
    if (!text || text === lastCommitted) return false;
    lastCommitted = text;
    provider.onResult?.({ text, isFinal: true });
    return true;
  }

  function markAlive() {
    sessionAlive = true;
  }

  function detachAndAbort(mine: SpeechRecognitionLike | null) {
    if (!mine) return;
    mine.onstart = null;
    mine.onaudiostart = null;
    mine.onresult = null;
    mine.onerror = null;
    mine.onend = null;
    try {
      mine.abort();
    } catch {
      /* already idle */
    }
  }

  function begin(surfaceStartFailure: boolean) {
    if (!Ctor) return;
    const gen = ++generation;
    if (apple) {
      syncDocumentLang();
      if (!rec) rec = new Ctor();
      rec.lang = locale;
      kick(rec, gen, surfaceStartFailure);
      return;
    }
    const previous = rec;
    if (previous) {
      previous.onstart = null;
      previous.onaudiostart = null;
      previous.onresult = null;
      previous.onerror = null;
      previous.onend = null;
      try {
        previous.abort();
      } catch {
        /* idle */
      }
    }
    rec = new Ctor();
    kick(rec, gen, surfaceStartFailure);
  }

  /** Point the original iOS recognizer at the new locale and start it in this tap. */
  function reviveApple() {
    if (!rec || !Ctor) return;
    // Publish whatever Safari already heard before the locale changes.
    commitDraft();
    const gen = ++generation;
    const mine = rec;
    // Idle (including the gap after a one-shot onend): start() in this tap.
    // Still live: start() throws, abort ends it, and onend starts the new locale.
    if (kick(mine, gen, true)) return;
    try {
      mine.abort();
    } catch {
      /* already ending */
    }
  }

  function kick(mine: SpeechRecognitionLike, gen: number, surfaceStartFailure: boolean): boolean {
    arm(mine, gen);
    try {
      mine.lang = locale;
      mine.start();
      if (apple) armWatchdog(mine, gen);
      return true;
    } catch (err) {
      // Live session: caller aborts and onend starts the new locale.
      if (alreadyStarted(err) || gen !== generation) return false;
      if (!surfaceStartFailure) return false;
      wantListening = false;
      provider.onError?.(
        err instanceof Error && err.message
          ? err.message
          : apple
            ? IPHONE_TYPE
            : "Could not start the microphone.",
      );
      return false;
    }
  }

  function armWatchdog(mine: SpeechRecognitionLike, gen: number) {
    const token = ++watchdogToken;
    scheduleWatchdog(() => {
      if (token !== watchdogToken || gen !== generation || !wantListening || sessionAlive) return;
      wantListening = false;
      cancelCommit();
      draft = "";
      try {
        mine.abort();
      } catch {
        /* never started */
      }
      provider.onError?.(IPHONE_TYPE);
    });
  }

  function scheduleDraftCommit(gen: number) {
    if (!apple) return;
    const token = ++commitToken;
    scheduleCommit(() => {
      if (token !== commitToken || gen !== generation || !wantListening) return;
      commitDraft();
    });
  }

  function restart(mine: SpeechRecognitionLike, gen: number) {
    scheduleRestart(() => {
      if (gen !== generation || !wantListening) return;
      try {
        sessionAlive = false;
        mine.lang = locale;
        mine.start();
        if (apple) armWatchdog(mine, gen);
      } catch (err) {
        // A Stop/abort event can land after Start already opened the new locale.
        if (alreadyStarted(err) || gen !== generation) return;
        wantListening = false;
        provider.onError?.(apple ? IPHONE_TYPE : "The microphone stopped. Type a caption instead.");
      }
    });
  }

  function arm(mine: SpeechRecognitionLike, gen: number) {
    mine.lang = locale;
    mine.continuous = !apple;
    mine.interimResults = true;
    mine.maxAlternatives = 1;
    draft = "";
    aborting = false;
    sessionAlive = false;
    cancelCommit();
    const emittedFinals = new Set<number>();

    const noteAlive = () => {
      if (gen !== generation) return;
      markAlive();
    };
    mine.onstart = noteAlive;
    mine.onaudiostart = noteAlive;

    mine.onresult = (event) => {
      if (gen !== generation) return;
      markAlive();
      let interim = "";
      // Walk the whole list: Chrome on Android often reports resultIndex 0
      // on every event and would re-emit earlier finals as new history lines.
      for (let i = 0; i < event.results.length; i += 1) {
        const chunk = event.results[i];
        const text = alternativeTranscript(chunk);
        if (!text) continue;
        if (chunk.isFinal) {
          if (!emittedFinals.has(i) && text !== lastCommitted) {
            emittedFinals.add(i);
            lastCommitted = text;
            draft = "";
            cancelCommit();
            provider.onResult?.({ text, isFinal: true });
          } else {
            draft = "";
            cancelCommit();
          }
        } else {
          interim += `${text} `;
        }
      }
      const interimText = interim.trim();
      // Safari sometimes ends with an empty result, then no-speech, and never
      // a useful onend. Keep the phrase so that path can still publish it.
      if (interimText) {
        if (interimText === lastCommitted) {
          draft = "";
          cancelCommit();
        } else if (interimText !== draft) {
          draft = interimText;
          // Same text repeating must not reset the quiet timer.
          scheduleDraftCommit(gen);
        }
      }
      provider.onResult?.({ text: interimText, isFinal: false });
    };

    mine.onerror = (event) => {
      if (gen !== generation) return;
      markAlive();
      if (event.error === "aborted") {
        aborting = true;
        return;
      }
      if (event.error === "no-speech") {
        // iOS reports heard speech as no-speech, or ends a pause this way.
        // Commit here: Safari can skip onend or clear the result list first.
        // An empty pause is shown, not turned into a caption.
        if (apple && draft.trim() && draft.trim() !== lastCommitted) {
          commitDraft();
          return;
        }
        if (apple && !draft.trim()) provider.onError?.(IPHONE_NO_SPEECH);
        return;
      }
      // Desktop Chrome blips "network" and restarts. On iPhone that error means
      // the speech service never returned words — say so instead of spinning.
      if (event.error === "network" && !apple) return;
      if (event.error === "language-not-supported") {
        wantListening = false;
        provider.onError?.(localeRejectedMessage(locale, event.error));
        return;
      }
      wantListening = false;
      if (event.error === "not-allowed") {
        provider.onError?.(
          apple
            ? IPHONE_TYPE
            : "Microphone blocked. Allow mic access for this site, or type a caption.",
        );
        return;
      }
      if (apple) {
        // Keep a transcript Safari delivered before the error.
        commitDraft();
        provider.onError?.(IPHONE_TYPE);
        return;
      }
      provider.onError?.(event.error);
    };

    mine.onend = () => {
      // Stop() bumps generation and detaches this handler.
      if (gen !== generation) return;
      const skipped = aborting;
      aborting = false;
      // WebKit often leaves isFinal false. no-speech may already have committed;
      // this publishes the draft when the session ends without that error.
      if (!skipped && apple) commitDraft();
      // The next one-shot may repeat the same words. Index 0 is reused too.
      lastCommitted = "";
      emittedFinals.clear();
      draft = "";
      if (!wantListening) return;
      restart(mine, gen);
    };
  }

  return provider;
}
