import { MAX_LINES, type CaptionLine, type Lang } from "./types.ts";

export const INTERIM_ID = "interim";

export function finalizedLines(lines: CaptionLine[]): CaptionLine[] {
  return lines.filter((line) => line.isFinal && line.id !== INTERIM_ID);
}

/** Prefer the spoken language, then any pane that actually has words. */
export function previewCaption(line: CaptionLine | undefined, preferred: Lang): string {
  if (!line) return "";
  const ordered: Lang[] = [preferred, "en", "es", "pt"];
  for (const lang of ordered) {
    const text = line.text[lang]?.trim();
    if (text) return text;
  }
  return "";
}

export function normalizeCaption(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.?!…,;:]+$/u, "");
}

export function revisionOfLast(
  prevText: string | undefined,
  nextText: string,
): "duplicate" | "replace" | "append" {
  if (!prevText) return "append";
  const prev = normalizeCaption(prevText);
  const next = normalizeCaption(nextText);
  if (!prev || !next) return "append";
  if (prev === next) return "duplicate";
  if (next.startsWith(prev)) return "replace";
  if (prev.startsWith(next)) return "duplicate";
  return "append";
}

export function applyFinalLine(
  lines: CaptionLine[],
  line: CaptionLine,
  sourceLang: Lang,
  maxLines = MAX_LINES,
): CaptionLine[] {
  const history = finalizedLines(lines);
  const last = history.at(-1);
  const verdict = revisionOfLast(last?.text[sourceLang], line.text[sourceLang]);
  if (verdict === "duplicate") return history;
  if (verdict === "replace" && last) {
    return [...history.slice(0, -1), { ...line, id: last.id }].slice(-maxLines);
  }
  return [...history, line].slice(-maxLines);
}

export function appendFinalLine(
  lines: CaptionLine[],
  line: CaptionLine,
  maxLines = MAX_LINES,
): CaptionLine[] {
  return [...finalizedLines(lines), line].slice(-maxLines);
}

/**
 * The line shown the moment a final arrives, before translation returns:
 * the original words on their own pane. A growing revision of the last line
 * keeps that line's other panes until the new translations land.
 */
export function provisionalLine(
  spoken: string,
  paneLang: Lang,
  speaker: string,
  last?: CaptionLine,
  now = Date.now(),
  id: string = globalThis.crypto.randomUUID(),
): CaptionLine {
  const growing = last && revisionOfLast(last.text[paneLang], spoken) === "replace";
  const base: Record<Lang, string> = growing ? { ...last.text } : { en: "", es: "", pt: "" };
  base[paneLang] = spoken;
  return { id, isFinal: true, text: base, speaker, at: now };
}

/** Swap the provisional line (same id) for its translated version. */
export function settleProvisional(
  lines: CaptionLine[],
  line: CaptionLine,
  sourceLang: Lang,
  coalesce: boolean,
  maxLines = MAX_LINES,
): CaptionLine[] {
  const history = finalizedLines(lines);
  const index = history.findIndex((row) => row.id === line.id);
  if (index >= 0) {
    const next = [...history];
    next[index] = line;
    return next.slice(-maxLines);
  }
  // Cleared or scrolled out meanwhile: file it like any new final.
  return coalesce ? applyFinalLine(history, line, sourceLang, maxLines) : appendFinalLine(history, line, maxLines);
}
