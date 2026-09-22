import type { Lang } from "../types";
import { PHRASES, WORDS, type Triple } from "./mock-dict.ts";
import { foldDiacritics } from "./text.ts";
import type { Translator } from "./types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function preserveCase(source: string, translated: string): string {
  if (source === source.toUpperCase() && source.length > 1) return translated.toUpperCase();
  if (source[0] && source[0] === source[0].toUpperCase()) {
    return translated.charAt(0).toUpperCase() + translated.slice(1);
  }
  return translated;
}

/** Accent-insensitive word-boundary pattern; run against NFD text. */
function foldedPhrasePattern(pattern: string): string {
  const folded = foldDiacritics(pattern);
  const body = [...folded]
    .map((ch) => (/\p{L}/u.test(ch) ? `${escapeRegExp(ch)}\\p{M}*` : escapeRegExp(ch)))
    .join("");
  return `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`;
}

type PhraseEntry = { pattern: string; to: string; len: number };

function phraseEntries(from: Lang, to: Lang, triples: Triple[]): PhraseEntry[] {
  return triples
    .map((row) => ({ pattern: row[from], to: row[to], len: foldDiacritics(row[from]).length }))
    .filter((row) => row.pattern && row.to)
    .sort((a, b) => b.len - a.len);
}

const PHRASE_INDEX: Record<string, PhraseEntry[]> = {};
const WORD_INDEX: Record<string, Map<string, string>> = {};

for (const from of ["en", "es", "pt"] as Lang[]) {
  for (const to of ["en", "es", "pt"] as Lang[]) {
    if (from === to) continue;
    const key = `${from}:${to}`;
    PHRASE_INDEX[key] = phraseEntries(from, to, PHRASES);
    const words = new Map<string, string>();
    for (const row of WORDS) {
      const src = foldDiacritics(row[from]);
      if (src && !words.has(src)) words.set(src, row[to]);
    }
    WORD_INDEX[key] = words;
  }
}

export const mockTranslator: Translator = {
  id: "mock",
  async translate(text, from, to) {
    if (from === to || !text.trim()) return text;
    const key = `${from}:${to}`;
    let output = text.normalize("NFD");
    const slots: string[] = [];

    for (const phrase of PHRASE_INDEX[key] ?? []) {
      const re = new RegExp(foldedPhrasePattern(phrase.pattern), "giu");
      output = output.replace(re, (match) => {
        const token = `\uE000${slots.length}\uE001`;
        slots.push(preserveCase(match, phrase.to));
        return token;
      });
    }

    output = output.replace(/[\p{L}]+(?:['’][\p{L}]+)?/gu, (word) => {
      const mapped = WORD_INDEX[key]?.get(foldDiacritics(word));
      return mapped ? preserveCase(word, mapped) : word;
    });

    output = output.replace(/\uE000(\d+)\uE001/g, (_match, index) => slots[Number(index)] ?? "");
    return output.normalize("NFC");
  },
};
