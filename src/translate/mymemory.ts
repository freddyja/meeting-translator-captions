import type { Lang } from "../types";
import { sameCaption, wordCount } from "./text.ts";
import type { Translator } from "./types";

const ENDPOINT = "https://api.mymemory.translated.net/get";
const MAX_QUERY_BYTES = 500;
const DEFAULT_TIMEOUT_MS = 8000;

export type MyMemoryOptions = {
  /** Optional `de` email. Raises the anonymous daily cap; not an API key. */
  email?: string;
  timeoutMs?: number;
  /** Test hook so verify scripts can force MyMemory to fail. */
  endpoint?: string;
};

type MyMemoryPayload = {
  responseData?: { translatedText?: string };
  responseStatus?: number | string;
  responseDetails?: string;
  quotaFinished?: boolean | null;
};

function pair(from: Lang, to: Lang): string {
  return `${from}|${to}`;
}

function truncateUtf8Bytes(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let end = Math.min(text.length, maxBytes);
  while (end > 0 && encoder.encode(text.slice(0, end)).length > maxBytes) {
    end -= 1;
  }
  return text.slice(0, end);
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

export function isIdentityTranslation(source: string, translated: string): boolean {
  return wordCount(source) >= 2 && sameCaption(source, translated);
}

export function isMyMemoryFailureText(text: string): boolean {
  const upper = text.toUpperCase();
  return (
    upper.includes("MYMEMORY WARNING") ||
    upper.includes("QUERY LENGTH LIMIT") ||
    upper.includes("INVALID LANGUAGE PAIR") ||
    upper.includes("PLEASE SELECT TWO DISTINCT LANGUAGES")
  );
}

/** Parse a MyMemory JSON body or throw so callers can fall back to mock. */
export function parseMyMemoryResponse(data: MyMemoryPayload): string {
  const status = Number(data.responseStatus);
  const translated = decodeHtmlEntities(data.responseData?.translatedText?.trim() || "");
  if (data.quotaFinished || status === 429 || status === 403) {
    throw new Error(data.responseDetails || "MyMemory quota exceeded");
  }
  if (status && status !== 200) {
    throw new Error(data.responseDetails || `MyMemory status ${status}`);
  }
  if (!translated || isMyMemoryFailureText(translated)) {
    throw new Error(translated || "MyMemory returned no text");
  }
  return translated;
}

export function createMyMemoryTranslator(options: MyMemoryOptions = {}): Translator {
  const cache = new Map<string, string>();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const email = options.email?.trim();
  const endpoint = options.endpoint?.trim() || ENDPOINT;

  return {
    id: "mymemory",
    async translate(text, from, to) {
      if (from === to || !text.trim()) return text;
      const source = text.trim();
      const key = `${pair(from, to)}:${source}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;

      const url = new URL(endpoint);
      url.searchParams.set("q", truncateUtf8Bytes(source, MAX_QUERY_BYTES));
      url.searchParams.set("langpair", pair(from, to));
      if (email) url.searchParams.set("de", email);

      const res = await fetch(url, {
        headers: { "user-agent": "Meeting-Translator-Captions/0.1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
      const translated = parseMyMemoryResponse((await res.json()) as MyMemoryPayload);
      if (isIdentityTranslation(source, translated)) {
        throw new Error(`MyMemory left ${from}->${to} unchanged`);
      }
      cache.set(key, translated);
      return translated;
    },
  };
}
