import type { Lang } from "../types";
import { detectLang, langAttempts, neutralLang } from "./detect.ts";
import { isIdentityTranslation } from "./mymemory.ts";
import { sameCaption } from "./text.ts";

const LANGS: Lang[] = ["en", "es", "pt"];

/** A foreign pane still holding the transcript (or the same words plus punctuation). */
export function foreignEchoes(source: string, from: Lang, map: Record<Lang, string>): boolean {
  return LANGS.some((lang) => lang !== from && isIdentityTranslation(source, map[lang] || ""));
}

/**
 * Original text stays on the spoken pane. An unchanged copy is dropped from
 * the other panes so Spanish speech cannot sit in the English window.
 */
export function stripForeignEchoes(
  source: string,
  from: Lang,
  map: Record<Lang, string>,
): Record<Lang, string> {
  const out: Record<Lang, string> = { en: "", es: "", pt: "" };
  for (const lang of LANGS) {
    const value = (map[lang] || "").trim();
    if (lang === from) {
      out[lang] = source;
      continue;
    }
    if (!value || isIdentityTranslation(source, value)) continue;
    out[lang] = value;
  }
  return out;
}

/** Pane that actually holds this utterance, after translation retargets a wrong hint. */
export function spokenKey(source: string, map: Record<Lang, string>, hint: Lang): Lang {
  const hits = LANGS.filter((lang) => sameCaption(map[lang] || "", source));
  if (hits.includes(hint)) return hint;
  return hits[0] ?? detectLang(source, hint);
}

export async function translateUntilSpoken(
  translateAll: (text: string, from: Lang) => Promise<Record<Lang, string>>,
  text: string,
  hint: Lang,
): Promise<Record<Lang, string>> {
  const marked = neutralLang(text);
  const attempts = langAttempts(text, hint);
  let lastFrom = attempts[0];
  let last: Record<Lang, string> = { en: "", es: "", pt: "" };
  for (const from of attempts) {
    lastFrom = from;
    last = await translateAll(text, from);
    const echoed = foreignEchoes(text, from, last);
    if (!echoed && (!marked || marked === from)) return stripForeignEchoes(text, from, last);
    if (marked && marked === from) break;
  }
  return stripForeignEchoes(text, lastFrom, last);
}
