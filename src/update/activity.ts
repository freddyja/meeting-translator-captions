import type { SpeechProvider } from "../stt/web-speech.ts";

const live = new Set<object>();
let lastCaptionAt = 0;
const listeners = new Set<() => void>();

function changed() {
  for (const fn of listeners) fn();
}

export function onActivityChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function micLive(): boolean {
  return live.size > 0;
}

export function lastCaption(): number {
  return lastCaptionAt;
}

/**
 * Watches start/stop/results so an update never reloads under a live mic.
 * Delegates everything, so the provider's single iOS recognizer and its
 * setLang(locale, prime) reuse are untouched.
 */
export function trackSpeech(inner: SpeechProvider): SpeechProvider {
  const key = {};
  let handler: SpeechProvider["onResult"] = null;
  inner.onResult = (result) => {
    lastCaptionAt = Date.now();
    handler?.(result);
  };
  return {
    get supported() {
      return inner.supported;
    },
    start() {
      live.add(key);
      changed();
      inner.start();
    },
    stop() {
      inner.stop();
      live.delete(key);
      lastCaptionAt = Date.now();
      changed();
    },
    setLang(locale: string, prime?: boolean) {
      inner.setLang(locale, prime);
    },
    get onResult() {
      return handler;
    },
    set onResult(fn) {
      handler = fn;
    },
    get onError() {
      return inner.onError;
    },
    set onError(fn) {
      inner.onError = fn;
    },
  };
}
