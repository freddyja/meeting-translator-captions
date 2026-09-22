/** Lowercase and strip combining marks so ES/PT STT without accents still matches. */
export function foldDiacritics(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function sameCaption(a: string, b: string): boolean {
  return foldDiacritics(a).replace(/\s+/g, " ").trim() === foldDiacritics(b).replace(/\s+/g, " ").trim();
}

export function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
