/** Hard cap on one /api/translate round trip. The original line is already on screen. */
export const TRANSLATE_TIMEOUT_MS = 5000;
/** Extra tries for a sleeping (Render free tier) or briefly unreachable server. */
export const TRANSLATE_RETRIES = 1;
export const TRANSLATE_RETRY_BASE_MS = 800;

export type TranslateNetStatus = "ok" | "waking";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class TranslateTimeoutError extends Error {
  constructor(ms: number) {
    super(`Translate timed out after ${ms} ms`);
    this.name = "TranslateTimeoutError";
  }
}

/** Network failure, timeout, or a proxy/gateway status a cold start returns. */
export function isRetryableTranslateError(err: unknown): boolean {
  if (err instanceof TranslateTimeoutError) return true;
  if (err instanceof TypeError) return true; // fetch network failure
  const status = (err as { status?: unknown } | null)?.status;
  return status === 502 || status === 503 || status === 504;
}

/** One POST with an AbortController deadline. */
export async function postJsonWithTimeout(
  url: string,
  body: unknown,
  opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? TRANSLATE_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw Object.assign(new Error(`Translate HTTP ${res.status}`), { status: res.status });
    return await res.json();
  } catch (err) {
    if (timedOut) throw new TranslateTimeoutError(timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retry only cold-start-shaped failures, with backoff, and report "waking"
 * so the UI can say so. Anything else (or the last failure) is thrown, which
 * hands the caption to the existing DeepL → MyMemory → MinT → mock chain.
 */
export async function postTranslateWithRetry(
  url: string,
  body: unknown,
  opts: {
    timeoutMs?: number;
    retries?: number;
    retryBaseMs?: number;
    fetchImpl?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    onStatus?: (status: TranslateNetStatus) => void;
  } = {},
): Promise<unknown> {
  const retries = opts.retries ?? TRANSLATE_RETRIES;
  const base = opts.retryBaseMs ?? TRANSLATE_RETRY_BASE_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      const data = await postJsonWithTimeout(url, body, opts);
      opts.onStatus?.("ok");
      return data;
    } catch (err) {
      if (attempt >= retries || !isRetryableTranslateError(err)) {
        if (isRetryableTranslateError(err)) opts.onStatus?.("waking");
        throw err;
      }
      opts.onStatus?.("waking");
      await sleep(base * 2 ** attempt);
    }
  }
}

const statusListeners = new Set<(status: TranslateNetStatus) => void>();
let lastStatus: TranslateNetStatus = "ok";

export function reportTranslateStatus(status: TranslateNetStatus): void {
  if (status === lastStatus) return;
  lastStatus = status;
  for (const listener of statusListeners) listener(status);
}

export function translateStatus(): TranslateNetStatus {
  return lastStatus;
}

export function subscribeTranslateStatus(listener: (status: TranslateNetStatus) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/** Nothing a translator could change: digits, punctuation, symbols, emoji. */
export function hasNothingToTranslate(text: string): boolean {
  return !/\p{L}/u.test(text);
}
