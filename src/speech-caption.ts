import type { Lang } from "./types.ts";
import { detectLang } from "./translate/detect.ts";

/** `es-ES` / `pt-BR` / `en-US` → the caption pane that locale was asking for. */
export function langFromLocale(locale: string): Lang {
  const base = locale.trim().toLowerCase().split("-")[0];
  if (base === "es") return "es";
  if (base === "pt") return "pt";
  return "en";
}

/**
 * Language a microphone utterance is filed under.
 * Same check as typed captions: a clear Spanish or Portuguese phrase overrides
 * an English Spoken chip. `heardLocale` is the locale we requested. A sticky
 * en-US engine must not become the source language — "mi casa es Roja" stayed
 * in the English pane when the mic hint was trusted past the marker check.
 */
export function speechSourceLang(text: string, chip: Lang, heardLocale?: string): Lang {
  void heardLocale;
  return detectLang(text, chip);
}
