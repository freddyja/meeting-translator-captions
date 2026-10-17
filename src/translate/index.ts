import { isOfflineMeeting } from "../offline-mode";
import { detectLang } from "./detect";
import { createMinTTranslator } from "./mint";
import { mockTranslator } from "./mock";
import { createLibreTranslator } from "./libretranslate";
import { createMyMemoryTranslator } from "./mymemory";
import { stripForeignEchoes, translateUntilSpoken } from "./panes";
import { passthroughTranslator } from "./passthrough";
import { hasNothingToTranslate } from "./request";
import { createServerTranslator } from "./server";
import { translateAll as runTranslateAll, type Translator } from "./types";
import type { Lang } from "../types";

export type { Translator } from "./types";
export { detectLang } from "./detect";
export { translateAll } from "./types";

export function createTranslator(): Translator {
  const provider = String(import.meta.env.VITE_TRANSLATE_PROVIDER || "").toLowerCase();
  const primary = translatorForProvider(provider);
  return withOfflineMode(primary);
}

function translatorForProvider(provider: string): Translator {
  if (provider === "passthrough") return passthroughTranslator;
  if (provider === "mymemory") {
    const email = String(import.meta.env.VITE_MYMEMORY_EMAIL || "").trim() || undefined;
    return withFallback(createMyMemoryTranslator({ email }));
  }
  if (provider === "mint") return withFallback(createMinTTranslator());
  if (provider === "libretranslate") return withFallback(createLibreTranslator());
  if (provider === "mock") return mockTranslator;
  return withFallback(createServerTranslator());
}

const RECENT_LIMIT = 50;
/** The same words again (a repeated phrase, a coalesced final) reuse the last result. */
const recent = new Map<string, Record<Lang, string>>();

function remember(key: string, value: Record<Lang, string>): void {
  recent.delete(key);
  recent.set(key, { ...value });
  while (recent.size > RECENT_LIMIT) {
    const first = recent.keys().next().value;
    if (first === undefined) break;
    recent.delete(first);
  }
}

function withOfflineMode(primary: Translator): Translator {
  const active = () => (isOfflineMeeting() ? mockTranslator : primary);
  return {
    get id() {
      return active().id;
    },
    translate(text, from, to) {
      return active().translate(text, from, to);
    },
    async translateAll(text, from) {
      // Unchanged text needs no network and no DeepL → MyMemory → MinT → mock chain.
      if (hasNothingToTranslate(text)) return { en: text, es: text, pt: text };
      const engine = active();
      // Speech and Type+Send share this path. A mic-only hint that skipped
      // detection left Spanish ("mi casa es Roja") in the English pane.
      if (isOfflineMeeting() || engine.id === "mock") {
        return translateUntilSpoken((value, spoken) => runTranslateAll(engine, value, spoken), text, from);
      }
      const spoken = detectLang(text, from);
      const key = `${spoken}\u0000${text.trim()}`;
      const hit = recent.get(key);
      if (hit) return { ...hit };
      const mapped = await runTranslateAll(engine, text, spoken);
      // Remember only live-provider results; a mock fallback should be retried.
      if (engine.id !== "mock") remember(key, mapped);
      return mapped;
    },
  };
}

function withFallback(primary: Translator): Translator {
  const allowMintFallback = primary.id !== "mint";
  let lastId = primary.id;
  return {
    get id() {
      return lastId;
    },
    async translate(text, from, to) {
      try {
        const translated = await primary.translate(text, from, to);
        lastId = primary.id;
        return translated;
      } catch (err) {
        if (allowMintFallback) {
          try {
            const minted = await createMinTTranslator().translate(text, from, to);
            lastId = "mint";
            return minted;
          } catch {
            /* mock */
          }
        }
        console.warn(`[translate] ${primary.id} failed, using mock`, err);
        lastId = "mock";
        return mockTranslator.translate(text, from, to);
      }
    },
    async translateAll(text, from, options) {
      try {
        const mapped = await runTranslateAll(primary, text, from, options);
        lastId = primary.id;
        return mapped;
      } catch (err) {
        console.warn(`[translate] ${primary.id} failed, trying MinT then mock`, err);
      }
      if (allowMintFallback) {
        try {
          const mint = createMinTTranslator();
          const mapped = await runTranslateAll(mint, text, from);
          lastId = "mint";
          return mapped;
        } catch {
          /* mock */
        }
      }
      lastId = "mock";
      return stripForeignEchoes(text, from, {
        en: from === "en" ? text : await safeMock(text, from, "en"),
        es: from === "es" ? text : await safeMock(text, from, "es"),
        pt: from === "pt" ? text : await safeMock(text, from, "pt"),
      });
    },
  };
}

async function safeMock(text: string, from: import("../types").Lang, to: import("../types").Lang): Promise<string> {
  try {
    return await mockTranslator.translate(text, from, to);
  } catch {
    return text;
  }
}
