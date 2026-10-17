import type { Lang } from "./types.ts";

/** One phrase on the Two-person conversation page. */
export type TalkLine = {
  /** The page's utterance id: one bubble per utterance, updated in place. */
  id: number;
  lang: Lang;
  original: string;
  rows: Record<Lang, string> | null;
  /** Still hearing interims for this utterance. */
  live?: boolean;
};

/** The other person's language: what a phrase is shown in, big, in the split view. */
export function shownLang(line: Pick<TalkLine, "lang">, pair: readonly [Lang, Lang]): Lang {
  return line.lang === pair[0] ? pair[1] : pair[0];
}

/**
 * A phrase as read in `lang`: the speaker's own words when they spoke it,
 * else the translation (null while it is still translating).
 */
export function captionIn(line: TalkLine, lang: Lang): string | null {
  if (line.lang === lang) return line.original;
  return line.rows ? (line.rows[lang] ?? line.original) : null;
}

/** Every phrase in one language, oldest first, for the expanded full-screen view. */
export function captionsIn(lines: readonly TalkLine[], lang: Lang): Array<{ id: number; text: string | null; spoken: boolean }> {
  return lines.map((line) => ({ id: line.id, text: captionIn(line, lang), spoken: line.lang === lang }));
}
