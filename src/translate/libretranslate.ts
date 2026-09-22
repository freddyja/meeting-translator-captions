import type { Translator } from "./types";

export function createLibreTranslator(): Translator {
  const endpoint = import.meta.env.VITE_LIBRETRANSLATE_URL as string | undefined;
  const apiKey = import.meta.env.VITE_LIBRETRANSLATE_API_KEY as string | undefined;
  const cache = new Map<string, string>();

  return {
    id: "libretranslate",
    async translate(text, from, to) {
      if (from === to || !text.trim()) return text;
      if (!endpoint) {
        throw new Error("VITE_LIBRETRANSLATE_URL is not set");
      }
      const key = `${from}:${to}:${text}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: text,
          source: from,
          target: to,
          format: "text",
          api_key: apiKey || undefined,
        }),
      });
      if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
      const data = (await res.json()) as { translatedText?: string };
      const translated = data.translatedText?.trim() || text;
      cache.set(key, translated);
      return translated;
    },
  };
}
