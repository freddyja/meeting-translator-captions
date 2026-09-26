import type { Lang } from "./types.ts";
import { neutralLang, scoreLangs } from "./translate/detect.ts";

/**
 * How far another language must lead before it overrides the Spoken chip.
 * Web Speech on a stuck en-US engine inserts "the" / "is" / "you" into Spanish.
 * Those score under 4. "Hola amigos" and "Welcome everyone" still clear the bar.
 */
const SPEECH_OVERRIDE_LEAD = 4;

/** `es-ES` / `pt-BR` / `en-US` → the caption pane that locale was asking for. */
export function langFromLocale(locale: string): Lang {
  const base = locale.trim().toLowerCase().split("-")[0];
  if (base === "es") return "es";
  if (base === "pt") return "pt";
  return "en";
}

/**
 * Language a microphone utterance is filed under.
 * `heardLocale` is the locale we asked the recognizer for. WebKit can keep
 * answering in en-US after that request moves to es-ES or pt-BR, so the
 * engine locale is not a source language. The Spoken chip is.
 * Marker words override the chip only when they lead by 4.
 */
export function speechSourceLang(text: string, chip: Lang, heardLocale?: string): Lang {
  // The recognizer request is part of the utterance (`es-ES` while WebKit is
  // still on en-US). It must not replace the Spoken chip.
  void heardLocale;
  const marked = neutralLang(text);
  if (!marked || marked === chip) return chip;
  const scores = scoreLangs(text);
  if (scores[marked] >= scores[chip] + SPEECH_OVERRIDE_LEAD) return marked;
  return chip;
}
