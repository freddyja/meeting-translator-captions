import { isOfflineMeeting } from "../offline-mode";
import { isLang, type Lang } from "../types";
import { stripForeignEchoes } from "./panes";
import type { TranslateAllOptions, Translator } from "./types";

type TranslateResponse = {
  provider?: string;
  from?: Lang;
  text?: string | Record<Lang, string>;
};

export function createServerTranslator(): Translator {
  let lastProvider = "server";
  return {
    get id() {
      return lastProvider;
    },
    async translate(text, from, to) {
      if (from === to || !text.trim()) return text;
      const result = await postTranslate(text, from, [to]);
      if (result.provider) lastProvider = result.provider;
      const value = result.text;
      if (typeof value === "string") return value;
      if (value && typeof value[to] === "string" && value[to]) return value[to];
      throw new Error("Translate API returned no text");
    },
    async translateAll(text, from, options) {
      if (!text.trim()) return { en: "", es: "", pt: "" };
      const result = await postTranslate(text, from, undefined, options);
      if (result.provider) lastProvider = result.provider;
      const value = result.text;
      if (!value || typeof value === "string") {
        throw new Error("Translate API returned no map");
      }
      const sourceLang = isLang(result.from) ? result.from : from;
      return stripForeignEchoes(text, sourceLang, {
        en: value.en || (sourceLang === "en" ? text : ""),
        es: value.es || (sourceLang === "es" ? text : ""),
        pt: value.pt || (sourceLang === "pt" ? text : ""),
      });
    },
  };
}

async function postTranslate(
  text: string,
  from: Lang,
  to?: Lang[],
  options?: TranslateAllOptions,
): Promise<TranslateResponse> {
  const payload: Record<string, unknown> = {
    text,
    from,
    to: to ?? (["en", "es", "pt"] as Lang[]),
  };
  if (options?.trustHint) payload.trustHint = true;
  if (isOfflineMeeting()) payload.provider = "mock";
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);
  return (await res.json()) as TranslateResponse;
}
