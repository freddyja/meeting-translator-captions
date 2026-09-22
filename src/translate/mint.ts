import { isIdentityTranslation } from "./mymemory.ts";
import type { Translator } from "./types";

/** Wikimedia-hosted MinT. No API key. */
export const MINT_ENDPOINT = "https://translate.wmcloud.org/api/translate";
const DEFAULT_TIMEOUT_MS = 15000;

export type MinTOptions = {
  timeoutMs?: number;
  endpoint?: string;
};

type MinTPayload = {
  translation?: string;
  model?: string;
};

export function parseMinTResponse(data: MinTPayload): string {
  const translated = String(data.translation || "").trim();
  if (!translated) throw new Error("MinT returned no text");
  return translated;
}

export function createMinTTranslator(options: MinTOptions = {}): Translator {
  const cache = new Map<string, string>();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = options.endpoint?.trim() || MINT_ENDPOINT;

  return {
    id: "mint",
    async translate(text, from, to) {
      if (from === to || !text.trim()) return text;
      const source = text.trim();
      const key = `${from}:${to}:${source}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "user-agent": "Meeting-Translator-Captions/0.1.0",
        },
        body: JSON.stringify({
          format: "text",
          content: source,
          source_language: from,
          target_language: to,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`MinT HTTP ${res.status}`);
      const translated = parseMinTResponse((await res.json()) as MinTPayload);
      if (isIdentityTranslation(source, translated)) {
        throw new Error(`MinT left ${from}->${to} unchanged`);
      }
      cache.set(key, translated);
      return translated;
    },
  };
}
