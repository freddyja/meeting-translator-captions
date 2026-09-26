/** Lowercase and strip combining marks so ES/PT STT without accents still matches. */
export function foldDiacritics(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function captionWords(value: string): string {
  return foldDiacritics(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same words, ignoring case, accents, and punctuation. */
export function sameCaption(a: string, b: string): boolean {
  return captionWords(a) === captionWords(b);
}

export function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
