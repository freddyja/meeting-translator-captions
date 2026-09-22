import { isAppleMobile } from "./capability.ts";

export type SpeechResult = {
  text: string;
  isFinal: boolean;
};

export type SpeechProvider = {
  readonly supported: boolean;
  start(): void;
  stop(): void;
  setLang(locale: string): void;
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
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

export type WebSpeechOptions = {
  /** When omitted, detected from the user agent. */
  appleMobile?: boolean;
  /** Injected in tests. Omitted means `webkitSpeechRecognition` / `SpeechRecognition`. */
  recognitionCtor?: RecognitionCtor | null;
  /** One-shot restart. Tests run this immediately instead of waiting on a timer. */
  scheduleRestart?: (run: () => void) => void;
};

const IPHONE_TYPE =
  "iPhone couldn't capture speech. Type a caption — Send still reaches every phone and the TV.";

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

function alreadyStarted(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name: unknown }).name) : "";
  const message = err instanceof Error ? err.message : String(err);
  return name === "InvalidStateError" || /already started|invalidstate/i.test(`${name} ${message}`);
}

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function createWebSpeechProvider(options: WebSpeechOptions = {}): SpeechProvider {
  const apple = options.appleMobile ?? isAppleMobile();
  const Ctor = options.recognitionCtor === undefined ? getRecognitionCtor() : options.recognitionCtor;
  const scheduleRestart =
    options.scheduleRestart ??
    ((run: () => void) => {
      window.setTimeout(run, apple ? 200 : 120);
    });

  let rec: SpeechRecognitionLike | null = null;
  let locale = "en-US";
  let wantListening = false;
  let generation = 0;

  const provider: SpeechProvider = {
    supported: Boolean(Ctor),
    onResult: null,
    onError: null,
    setLang(next) {
      const localeNext = next.trim() || locale;
      if (localeNext === locale) return;
      locale = localeNext;
      if (!wantListening) return;
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
      const mine = rec;
      // Drop the desktop object. On iOS the next Start must reuse it or the
      // engine keeps the first session's language (English).
      if (!apple) rec = null;
      detachAndAbort(mine);
    },
  };

  function detachAndAbort(mine: SpeechRecognitionLike | null) {
    if (!mine) return;
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
      if (!rec) rec = new Ctor();
      kick(rec, gen, surfaceStartFailure);
      return;
    }
    const previous = rec;
    if (previous) {
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

  function arm(mine: SpeechRecognitionLike, gen: number) {
    mine.lang = locale;
    mine.continuous = !apple;
    mine.interimResults = true;
    mine.maxAlternatives = 1;
    const emittedFinals = new Set<number>();

    mine.onresult = (event) => {
      if (gen !== generation) return;
      let interim = "";
      // Walk the whole list: Chrome on Android often reports resultIndex 0
      // on every event and would re-emit earlier finals as new history lines.
      for (let i = 0; i < event.results.length; i += 1) {
        const chunk = event.results[i];
        const text = chunk[0].transcript.trim();
        if (!text) continue;
        if (chunk.isFinal) {
          if (!emittedFinals.has(i)) {
            emittedFinals.add(i);
            provider.onResult?.({ text, isFinal: true });
          }
        } else {
          interim += `${text} `;
        }
      }
      provider.onResult?.({ text: interim.trim(), isFinal: false });
    };

    mine.onerror = (event) => {
      if (gen !== generation) return;
      if (event.error === "aborted" || event.error === "no-speech") return;
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
        provider.onError?.(IPHONE_TYPE);
        return;
      }
      provider.onError?.(event.error);
    };

    mine.onend = () => {
      if (gen !== generation || !wantListening) return;
      scheduleRestart(() => {
        if (gen !== generation || !wantListening) return;
        try {
          mine.lang = locale;
          mine.start();
        } catch (err) {
          // A Stop/abort event can land after Start already opened the new locale.
          if (alreadyStarted(err) || gen !== generation) return;
          wantListening = false;
          provider.onError?.(apple ? IPHONE_TYPE : "The microphone stopped. Type a caption instead.");
        }
      });
    };
  }

  return provider;
}
