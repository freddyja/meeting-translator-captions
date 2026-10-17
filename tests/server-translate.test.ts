import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { translateCaption } from "../server/translate.ts";

const realFetch = globalThis.fetch;
const saved = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...saved };
});

function recordFetch(handler: (url: string, body: any) => unknown) {
  const hosts: string[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    hosts.push(new URL(url).host);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return new Response(JSON.stringify(handler(url, body)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return hosts;
}

describe("translateCaption skips the fallback chain for unchanged text", () => {
  it("no letters: no provider is called and every pane shows the text", async () => {
    process.env.TRANSLATE_PROVIDER = "mymemory";
    const hosts = recordFetch(() => {
      throw new Error("should not fetch");
    });
    const result = await translateCaption("10:30", "en", ["en", "es", "pt"]);
    assert.deepEqual(hosts, []);
    assert.deepEqual(result.text, { en: "10:30", es: "10:30", pt: "10:30" });
  });

  it("DeepL answering with unchanged text does not fall through to MyMemory / MinT", async () => {
    process.env.TRANSLATE_PROVIDER = "deepl";
    process.env.DEEPL_API_KEY = "test-key:fx";
    // DeepL echoes the input (a name), and detects English.
    const hosts = recordFetch((_url, body) => ({
      translations: [{ text: Array.isArray(body.text) ? body.text[0] : body.text, detected_source_language: "EN" }],
    }));
    await translateCaption("Maria Gonzalez Rodriguez", "en", ["en", "es", "pt"]);
    assert.ok(hosts.length > 0);
    assert.ok(
      hosts.every((h) => h.includes("deepl.com")),
      `only DeepL was asked, got ${[...new Set(hosts)].join(", ")}`,
    );
  });
});
