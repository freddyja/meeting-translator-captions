import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TranslateTimeoutError,
  hasNothingToTranslate,
  isRetryableTranslateError,
  postJsonWithTimeout,
  postTranslateWithRetry,
} from "../src/translate/request.ts";

/** A fetch that never answers until aborted, like a sleeping Render instance. */
const hangingFetch = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("postJsonWithTimeout", () => {
  it("aborts and throws TranslateTimeoutError at the deadline", async () => {
    const started = Date.now();
    await assert.rejects(
      postJsonWithTimeout("/api/translate", {}, { timeoutMs: 60, fetchImpl: hangingFetch }),
      (err: unknown) => err instanceof TranslateTimeoutError,
    );
    assert.ok(Date.now() - started < 1000);
  });

  it("defaults to a 5 s deadline", async () => {
    const { TRANSLATE_TIMEOUT_MS } = await import("../src/translate/request.ts");
    assert.equal(TRANSLATE_TIMEOUT_MS, 5000);
  });

  it("returns JSON and sends an abort signal", async () => {
    let signal: AbortSignal | undefined;
    const data = await postJsonWithTimeout("/api/translate", { text: "hi" }, {
      fetchImpl: async (_u, init) => {
        signal = init?.signal ?? undefined;
        return json(200, { text: { es: "hola" } });
      },
    });
    assert.deepEqual(data, { text: { es: "hola" } });
    assert.ok(signal);
  });

  it("throws with the HTTP status", async () => {
    await assert.rejects(
      postJsonWithTimeout("/x", {}, { fetchImpl: async () => json(503, {}) }),
      (err: any) => err.status === 503,
    );
  });
});

describe("postTranslateWithRetry", () => {
  it("retries a cold-start 503 with backoff, reporting waking then ok", async () => {
    const statuses: string[] = [];
    const sleeps: number[] = [];
    let calls = 0;
    const data = await postTranslateWithRetry("/x", {}, {
      retries: 2,
      retryBaseMs: 100,
      sleep: async (ms) => void sleeps.push(ms),
      onStatus: (s) => statuses.push(s),
      fetchImpl: async () => (++calls < 3 ? json(503, {}) : json(200, { ok: 1 })),
    });
    assert.deepEqual(data, { ok: 1 });
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [100, 200]);
    assert.deepEqual(statuses, ["waking", "waking", "ok"]);
  });

  it("gives up after the retries so the fallback chain can run", async () => {
    let calls = 0;
    await assert.rejects(
      postTranslateWithRetry("/x", {}, {
        retries: 1,
        timeoutMs: 30,
        sleep: async () => {},
        fetchImpl: (u, i) => (calls++, hangingFetch(u, i)),
      }),
      TranslateTimeoutError,
    );
    assert.equal(calls, 2);
  });

  it("does not retry a 400 (bad request is not a cold start)", async () => {
    let calls = 0;
    await assert.rejects(
      postTranslateWithRetry("/x", {}, { sleep: async () => {}, fetchImpl: async () => (calls++, json(400, {})) }),
    );
    assert.equal(calls, 1);
  });
});

describe("retry classification and unchanged text", () => {
  it("classifies retryable failures", () => {
    assert.equal(isRetryableTranslateError(new TranslateTimeoutError(5)), true);
    assert.equal(isRetryableTranslateError(new TypeError("Failed to fetch")), true);
    assert.equal(isRetryableTranslateError(Object.assign(new Error(), { status: 502 })), true);
    assert.equal(isRetryableTranslateError(Object.assign(new Error(), { status: 400 })), false);
  });

  it("flags text with nothing to translate", () => {
    assert.equal(hasNothingToTranslate("10:30"), true);
    assert.equal(hasNothingToTranslate("3 + 4 = 7!"), true);
    assert.equal(hasNothingToTranslate("👍"), true);
    assert.equal(hasNothingToTranslate("Hola"), false);
    assert.equal(hasNothingToTranslate("Olá 2"), false);
  });
});
