import { isOfflineMeeting } from "../offline-mode";
import { detectLang } from "./detect";
import { createMinTTranslator } from "./mint";
import { mockTranslator } from "./mock";
import { createLibreTranslator } from "./libretranslate";
import { createMyMemoryTranslator } from "./mymemory";
import { stripForeignEchoes, translateUntilSpoken } from "./panes";
import { passthroughTranslator } from "./passthrough";
import { createServerTranslator } from "./server";
import { translateAll as runTranslateAll, type Translator } from "./types";

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

function withOfflineMode(primary: Translator): Translator {
  const active = () => (isOfflineMeeting() ? mockTranslator : primary);
  return {
    get id() {
      return active().id;
    },
    translate(text, from, to) {
      return active().translate(text, from, to);
    },
    translateAll(text, from) {
      const engine = active();
      // Speech and Type+Send share this path. A mic-only hint that skipped
      // detection left Spanish ("mi casa es Roja") in the English pane.
      if (isOfflineMeeting() || engine.id === "mock") {
        return translateUntilSpoken((value, spoken) => runTranslateAll(engine, value, spoken), text, from);
      }
      return runTranslateAll(engine, text, detectLang(text, from));
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
