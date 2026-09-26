import { detectLang, neutralLang } from "../src/translate/detect.ts";
import { deeplDetectLang, deeplTranslate } from "../src/translate/deepl.ts";
import { createMinTTranslator } from "../src/translate/mint.ts";
import { mockTranslator } from "../src/translate/mock.ts";
import { createMyMemoryTranslator, isIdentityTranslation } from "../src/translate/mymemory.ts";
import { foreignEchoes, stripForeignEchoes } from "../src/translate/panes.ts";
import { wordCount } from "../src/translate/text.ts";
import type { Translator } from "../src/translate/types.ts";
import { isLang, type Lang } from "../src/types.ts";

export type TranslateProvider = "deepl" | "google" | "mymemory" | "mint" | "mock";

const LANGS: Lang[] = ["en", "es", "pt"];
const MAX_TEXT = 2000;
const GOOGLE_URL = "https://translation.googleapis.com/language/translate/v2";
const MYMEMORY_COOLDOWN_MS = 10 * 60 * 1000;
const cache = new Map<string, string>();
const CACHE_LIMIT = 400;

let myMemory: Translator | null = null;
let myMemoryEmail: string | undefined;
let myMemoryEndpoint: string | undefined;
let mint: Translator | null = null;
let lastLiveProvider: TranslateProvider | null = null;
let myMemorySkipUntil = 0;

export { isLang };

function requestedProvider(): string {
  return String(process.env.TRANSLATE_PROVIDER || "").trim().toLowerCase();
}

export function googleKey(): string {
  return String(process.env.GOOGLE_TRANSLATE_API_KEY || "").trim();
}

export function deeplKey(): string {
  return String(process.env.DEEPL_API_KEY || process.env.DEEPL_AUTH_KEY || "").trim();
}

function deeplApiUrlOverride(): string {
  return String(process.env.DEEPL_API_URL || "").trim();
}

function myMemoryEmailFromEnv(): string | undefined {
  return String(process.env.MYMEMORY_EMAIL || "").trim() || undefined;
}

function myMemoryEndpointFromEnv(): string | undefined {
  return String(process.env.MYMEMORY_URL || "").trim() || undefined;
}

/**
 * Recommended provider is DeepL Free when DEEPL_API_KEY is set.
 * If that key is missing, MyMemory (no key) is tried first, then MinT
 * (Wikimedia, no key) before the mock dictionary.
 * Mock is opt-in for offline (`TRANSLATE_PROVIDER=mock` or POST provider=mock).
 * Google only when a Cloud key is present.
 */
export function resolveTranslateProvider(): TranslateProvider {
  const requested = requestedProvider();
  if (requested === "mock") return "mock";
  if (requested === "mint") return "mint";
  if (requested === "mymemory") return "mymemory";
  if ((requested === "google" || requested === "google-cloud") && googleKey()) return "google";
  if ((requested === "deepl" || requested === "") && deeplKey()) return "deepl";
  return "mymemory";
}

/**
 * Provider actually serving captions. After MyMemory quota/identity, this is
 * `mint` (or `mock` if MinT also failed) — not the configured default.
 */
export function reportedTranslateProvider(): TranslateProvider {
  const configured = resolveTranslateProvider();
  if (configured === "mock") return "mock";
  return lastLiveProvider ?? configured;
}

function noteLiveProvider(provider: TranslateProvider): void {
  lastLiveProvider = provider;
}

function myMemoryOnCooldown(): boolean {
  return Date.now() < myMemorySkipUntil;
}

function markMyMemoryFailure(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (/quota|429|403|MYMEMORY WARNING/i.test(msg)) {
    myMemorySkipUntil = Date.now() + MYMEMORY_COOLDOWN_MS;
  }
}

function myMemoryTimeoutFromEnv(): number | undefined {
  const raw = Number(process.env.MYMEMORY_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

function getMyMemoryTranslator(): Translator {
  const email = myMemoryEmailFromEnv();
  const endpoint = myMemoryEndpointFromEnv();
  if (!myMemory || myMemoryEmail !== email || myMemoryEndpoint !== endpoint) {
    myMemory = createMyMemoryTranslator({ email, endpoint, timeoutMs: myMemoryTimeoutFromEnv() });
    myMemoryEmail = email;
    myMemoryEndpoint = endpoint;
  }
  return myMemory;
}

function getMinTTranslator(): Translator {
  if (!mint) mint = createMinTTranslator();
  return mint;
}

export function emptyLocalized(source: string, from: Lang): Record<Lang, string> {
  return {
    en: from === "en" ? source : "",
    es: from === "es" ? source : "",
    pt: from === "pt" ? source : "",
  };
}

async function fillTargets(
  translator: { translate(text: string, from: Lang, to: Lang): Promise<string> },
  source: string,
  from: Lang,
  targets: Lang[],
  out: Record<Lang, string>,
): Promise<void> {
  await Promise.all(
    targets.map(async (to) => {
      out[to] = await translator.translate(source, from, to);
    }),
  );
}

async function tryMinTPair(
  source: string,
  from: Lang,
  to: Lang,
): Promise<{ text: string; provider: TranslateProvider } | null> {
  try {
    const text = await getMinTTranslator().translate(source, from, to);
    if (!isIdentityTranslation(source, text)) return { text, provider: "mint" };
  } catch (err) {
    console.warn("[translate] MinT pair failed; trying mock", from, to);
    console.warn(err instanceof Error ? err.message : "translate error");
  }
  return null;
}

async function tryMyMemoryPair(
  source: string,
  from: Lang,
  to: Lang,
): Promise<{ text: string; provider: TranslateProvider } | null> {
  if (myMemoryOnCooldown()) return null;
  try {
    const text = await getMyMemoryTranslator().translate(source, from, to);
    if (!isIdentityTranslation(source, text)) return { text, provider: "mymemory" };
  } catch (err) {
    markMyMemoryFailure(err);
    console.warn("[translate] MyMemory pair failed; trying MinT", from, to);
    console.warn(err instanceof Error ? err.message : "translate error");
  }
  if (from !== "en" && to !== "en" && !myMemoryOnCooldown()) {
    try {
      const viaEn = await getMyMemoryTranslator().translate(source, from, "en");
      if (!isIdentityTranslation(source, viaEn)) {
        const pivoted = await getMyMemoryTranslator().translate(viaEn, "en", to);
        if (!isIdentityTranslation(viaEn, pivoted)) return { text: pivoted, provider: "mymemory" };
      }
    } catch (err) {
      markMyMemoryFailure(err);
    }
  }
  return null;
}

async function translateOnePair(
  source: string,
  from: Lang,
  to: Lang,
  prefer: TranslateProvider,
): Promise<{ text: string; provider: TranslateProvider }> {
  if (from === to) return { text: source, provider: prefer };

  const tryMock = async (): Promise<string> => mockTranslator.translate(source, from, to);

  if (prefer === "deepl") {
    try {
      const text = await cachedDeepL(source, from, to);
      if (!isIdentityTranslation(source, text)) return { text, provider: "deepl" };
    } catch (err) {
      console.warn("[translate] DeepL pair failed; trying next", from, to);
      console.warn(err instanceof Error ? err.message : "translate error");
    }
  }

  if (prefer === "google") {
    try {
      const text = await googleTranslate(source, from, to);
      if (!isIdentityTranslation(source, text)) return { text, provider: "google" };
    } catch (err) {
      console.warn("[translate] Google pair failed; trying next", from, to);
      console.warn(err instanceof Error ? err.message : "translate error");
    }
  }

  if (prefer === "mint") {
    const minted = await tryMinTPair(source, from, to);
    if (minted) return minted;
    return { text: await tryMock(), provider: "mock" };
  }

  if (prefer !== "mock") {
    const remembered = await tryMyMemoryPair(source, from, to);
    if (remembered) return remembered;
    const minted = await tryMinTPair(source, from, to);
    if (minted) return minted;
  }

  return { text: await tryMock(), provider: "mock" };
}

export function effectiveTranslateProvider(requestProvider?: string): TranslateProvider {
  if (String(requestProvider || "").trim().toLowerCase() === "mock") return "mock";
  return resolveTranslateProvider();
}

async function renderCaption(
  source: string,
  from: Lang,
  targets: Lang[],
  provider: TranslateProvider,
): Promise<{ provider: TranslateProvider; text: Record<Lang, string> }> {
  const unique = [...new Set(targets.filter((lang) => lang !== from))];
  const out = emptyLocalized(source, from);

  if (provider === "mock") {
    await fillTargets(mockTranslator, source, from, unique, out);
    return { provider: "mock", text: out };
  }

  const used = new Set<TranslateProvider>();
  await Promise.all(
    unique.map(async (to) => {
      const result = await translateOnePair(source, from, to, provider);
      out[to] = result.text;
      used.add(result.provider);
    }),
  );

  const reported =
    used.has(provider)
      ? provider
      : used.has("mymemory")
        ? "mymemory"
        : used.has("mint")
          ? "mint"
          : used.has("mock")
            ? "mock"
            : provider;
  return { provider: reported, text: out };
}

/**
 * Hint is the Spoken chip. Markers override it. Unmarked speech is probed
 * with DeepL when a key is set, then other source languages are tried if a
 * foreign pane still echoes the transcript.
 */
async function resolveSpoken(source: string, hint: Lang, allowProbe: boolean): Promise<Lang> {
  const marked = neutralLang(source);
  if (marked) return marked;
  if (!allowProbe || wordCount(source) < 2 || !deeplKey()) return detectLang(source, hint);
  const cacheKey = `detect:${source}`;
  const cached = cacheGet(cacheKey);
  if (cached === "en" || cached === "es" || cached === "pt") return cached;
  try {
    const detected = await deeplDetectLang(source, { authKey: deeplKey(), apiUrl: deeplApiUrlOverride() });
    if (detected) {
      cacheSet(cacheKey, detected);
      return detected;
    }
  } catch (err) {
    console.warn("[translate] spoken-language probe failed");
    console.warn(err instanceof Error ? err.message : "detect error");
  }
  return hint;
}

export async function translateCaption(
  text: string,
  hintedFrom: Lang,
  targets: Lang[] = LANGS,
  options?: { provider?: string },
): Promise<{ provider: TranslateProvider; text: Record<Lang, string>; from: Lang }> {
  const source = text.trim();
  const provider = effectiveTranslateProvider(options?.provider);
  if (!source) {
    const from = detectLang(source, hintedFrom);
    return { provider, from, text: emptyLocalized("", from) };
  }
  if (source.length > MAX_TEXT) {
    throw Object.assign(new Error("Text is too long"), { status: 400 });
  }

  const marked = neutralLang(source);
  const spoken = await resolveSpoken(source, hintedFrom, provider !== "mock");
  const attempts = [spoken, ...LANGS.filter((lang) => lang !== spoken)];
  let winner = await renderCaption(source, attempts[0], targets, provider);
  let from = attempts[0];
  // A confident marker match is the spoken language. Only unmarked speech
  // may try the other languages when the first filing still echoes.
  if (!marked && foreignEchoes(source, from, winner.text)) {
    for (const alt of attempts.slice(1)) {
      const next = await renderCaption(source, alt, targets, provider);
      if (!foreignEchoes(source, alt, next.text)) {
        winner = next;
        from = alt;
        break;
      }
    }
  }

  if (provider !== "mock" && source) noteLiveProvider(winner.provider);
  return { provider: winner.provider, from, text: stripForeignEchoes(source, from, winner.text) };
}

function cacheGet(key: string): string | undefined {
  return cache.get(key);
}

function cacheSet(key: string, value: string): void {
  if (cache.size >= CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, value);
}

async function cachedDeepL(text: string, from: Lang, to: Lang): Promise<string> {
  const cacheKey = `deepl:${from}:${to}:${text}`;
  const hit = cacheGet(cacheKey);
  if (hit !== undefined) return hit;
  const translated = await deeplTranslate(text, from, to, {
    authKey: deeplKey(),
    apiUrl: deeplApiUrlOverride(),
  });
  cacheSet(cacheKey, translated);
  return translated;
}

async function googleTranslate(text: string, from: Lang, to: Lang): Promise<string> {
  const key = googleKey();
  if (!key) throw new Error("GOOGLE_TRANSLATE_API_KEY is not set");
  const cacheKey = `google:${from}:${to}:${text}`;
  const hit = cacheGet(cacheKey);
  if (hit !== undefined) return hit;

  const url = new URL(GOOGLE_URL);
  url.searchParams.set("key", key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: text, source: from, target: to, format: "text" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Google Translate HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    data?: { translations?: { translatedText?: string }[] };
  };
  const translated = data.data?.translations?.[0]?.translatedText?.trim();
  if (!translated) throw new Error("Google Translate returned no text");
  cacheSet(cacheKey, translated);
  return translated;
}

export function warnIfGoogleRequestedWithoutKey(): void {
  const requested = requestedProvider();
  if (requested === "deepl" && !deeplKey()) {
    console.warn(
      "[translate] TRANSLATE_PROVIDER=deepl but DEEPL_API_KEY is empty; using MyMemory then MinT (no keys). Set TRANSLATE_PROVIDER=mock for offline.",
    );
  }
  if ((requested === "google" || requested === "google-cloud") && !googleKey()) {
    console.warn(
      "[translate] TRANSLATE_PROVIDER=google but GOOGLE_TRANSLATE_API_KEY is empty; using MyMemory then MinT (no keys). Set TRANSLATE_PROVIDER=mock for offline.",
    );
  }
}
