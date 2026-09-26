import type { Lang } from "../types";

export const DEEPL_FREE_HOST = "https://api-free.deepl.com";
export const DEEPL_PRO_HOST = "https://api.deepl.com";

/** Source codes DeepL accepts for this app's EN/ES/PT. Portuguese source is `PT`. */
export function deeplSourceLang(from: Lang): string {
  if (from === "en") return "EN";
  if (from === "es") return "ES";
  return "PT";
}

/**
 * Target codes. `pt` → `PT-BR` (Brazilian Portuguese). `en` → `EN-US`
 * because DeepL no longer takes bare `EN` as a target.
 */
export function deeplTargetLang(to: Lang): string {
  if (to === "en") return "EN-US";
  if (to === "es") return "ES";
  return "PT-BR";
}

/**
 * Free keys end with `:fx` and must use api-free.deepl.com.
 * Pro keys use api.deepl.com unless DEEPL_API_URL overrides.
 */
export function resolveDeepLApiUrl(authKey = "", explicitUrl = ""): string {
  const explicit = explicitUrl.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (!authKey || authKey.endsWith(":fx")) return DEEPL_FREE_HOST;
  return DEEPL_PRO_HOST;
}

export function deeplTranslateUrl(authKey = "", explicitUrl = ""): string {
  return `${resolveDeepLApiUrl(authKey, explicitUrl)}/v2/translate`;
}

type DeepLPayload = {
  translations?: { text?: string; detected_source_language?: string }[];
  message?: string;
};

/** DeepL codes such as EN, EN-US, ES, PT, PT-BR. */
export function mapDeepLLang(code: string | undefined): Lang | null {
  const norm = String(code || "")
    .trim()
    .toUpperCase();
  if (norm.startsWith("EN")) return "en";
  if (norm.startsWith("ES")) return "es";
  if (norm.startsWith("PT")) return "pt";
  return null;
}

/**
 * Auto-detect result. When DeepL refuses because the text is already the
 * probe target, that target is the spoken language.
 */
export function langFromDeepLProbe(target: Lang, detectedCode: string | undefined, errorMessage = ""): Lang | null {
  const detected = mapDeepLLang(detectedCode);
  if (detected) return detected;
  if (/equal/i.test(errorMessage) && /source/i.test(errorMessage) && /target/i.test(errorMessage)) return target;
  return null;
}

export function parseDeepLResponse(data: DeepLPayload): string {
  const translated = data.translations?.[0]?.text?.trim();
  if (!translated) {
    throw new Error(data.message || "DeepL returned no text");
  }
  return translated;
}

export async function deeplTranslate(
  text: string,
  from: Lang,
  to: Lang,
  options: { authKey: string; apiUrl?: string; timeoutMs?: number },
): Promise<string> {
  const key = options.authKey.trim();
  if (!key) throw new Error("DEEPL_API_KEY is not set");

  const res = await fetch(deeplTranslateUrl(key, options.apiUrl || ""), {
    method: "POST",
    headers: {
      authorization: `DeepL-Auth-Key ${key}`,
      "content-type": "application/json",
      "user-agent": "Meeting-Translator-Captions/0.1.0",
    },
    body: JSON.stringify({
      text: [text],
      source_lang: deeplSourceLang(from),
      target_lang: deeplTargetLang(to),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
  });

  const data = (await res.json().catch(() => ({}))) as DeepLPayload;
  if (!res.ok) {
    const detail = data.message || `DeepL HTTP ${res.status}`;
    throw new Error(res.status === 456 ? `DeepL quota exceeded: ${detail}` : detail);
  }
  return parseDeepLResponse(data);
}

/** Omit source_lang so DeepL names the spoken language. Probe target is English. */
export async function deeplDetectLang(
  text: string,
  options: { authKey: string; apiUrl?: string; timeoutMs?: number },
): Promise<Lang | null> {
  const key = options.authKey.trim();
  const source = text.trim();
  if (!key || !source) return null;

  const res = await fetch(deeplTranslateUrl(key, options.apiUrl || ""), {
    method: "POST",
    headers: {
      authorization: `DeepL-Auth-Key ${key}`,
      "content-type": "application/json",
      "user-agent": "Meeting-Translator-Captions/0.1.0",
    },
    body: JSON.stringify({
      text: [source],
      target_lang: deeplTargetLang("en"),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
  });

  const data = (await res.json().catch(() => ({}))) as DeepLPayload;
  if (!res.ok) {
    const detail = data.message || `DeepL HTTP ${res.status}`;
    const message = res.status === 456 ? `DeepL quota exceeded: ${detail}` : detail;
    return langFromDeepLProbe("en", undefined, message);
  }
  return mapDeepLLang(data.translations?.[0]?.detected_source_language);
}
