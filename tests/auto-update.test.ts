import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { busyReason, CAPTION_QUIET_MS, decideUpdate, type Activity } from "../src/update/gate.ts";
import { isNewBuild, parseBuildInfo } from "../src/update/version.ts";
import { trackSpeech, micLive, lastCaption } from "../src/update/activity.ts";
import { cacheControl, createCaptionServer } from "../server/index.ts";

const idle: Activity = { micLive: false, lastCaptionAt: 0, roomActive: false, typing: false, now: 1_000_000 };

test("idle page reloads for a new build", () => {
  assert.equal(busyReason(idle), null);
  assert.equal(decideUpdate({ pending: true, busy: busyReason(idle) }), "reload");
  assert.equal(decideUpdate({ pending: false, busy: null }), "none");
});

test("update waits behind a pill while the mic is live, mid-caption, in a room or typing", () => {
  const cases: [Partial<Activity>, string][] = [
    [{ micLive: true }, "mic"],
    [{ lastCaptionAt: idle.now - 500 }, "caption"],
    [{ roomActive: true }, "room"],
    [{ typing: true }, "typing"],
  ];
  for (const [patch, reason] of cases) {
    const busy = busyReason({ ...idle, ...patch });
    assert.equal(busy, reason);
    assert.equal(decideUpdate({ pending: true, busy }), "pill");
    assert.equal(decideUpdate({ pending: true, busy, tapped: true }), "reload");
  }
  // The caption hold ends after the quiet gap.
  assert.equal(busyReason({ ...idle, lastCaptionAt: idle.now - CAPTION_QUIET_MS - 1 }), null);
});

test("no reload loop when the same build was already tried this session", () => {
  assert.equal(decideUpdate({ pending: true, busy: null, alreadyTried: true }), "pill");
});

test("trackSpeech marks the mic live and delegates setLang unchanged", () => {
  const calls: string[] = [];
  const inner = {
    supported: true,
    start: () => calls.push("start"),
    stop: () => calls.push("stop"),
    setLang: (l: string, p?: boolean) => calls.push(`lang:${l}:${p}`),
    onResult: null as ((r: { text: string; isFinal: boolean; locale: string }) => void) | null,
    onError: null,
  };
  const speech = trackSpeech(inner);
  let heard = "";
  speech.onResult = (r) => (heard = r.text);
  speech.setLang("es-ES", true);
  speech.start();
  assert.equal(micLive(), true);
  inner.onResult?.({ text: "hola", isFinal: false, locale: "es-ES" });
  assert.equal(heard, "hola");
  assert.ok(Date.now() - lastCaption() < 1000);
  speech.stop();
  assert.equal(micLive(), false);
  assert.deepEqual(calls, ["lang:es-ES:true", "start", "stop"]);
});

test("parseBuildInfo / isNewBuild", () => {
  assert.equal(parseBuildInfo("<!doctype html>"), null);
  assert.equal(parseBuildInfo({ version: "" }), null);
  const info = parseBuildInfo({ version: "abc123", builtAt: "x" });
  assert.deepEqual(info, { version: "abc123", builtAt: "x" });
  assert.equal(isNewBuild("abc123", info), false);
  assert.equal(isNewBuild("old999", info), true);
  assert.equal(isNewBuild("dev", info), false);
  assert.equal(isNewBuild("old999", null), false);
});

test("cache headers: html, sw.js and version.json are never served stale", () => {
  assert.equal(cacheControl("/x/index.html"), "no-cache");
  assert.equal(cacheControl("/x/sw.js"), "no-cache");
  assert.match(cacheControl("/x/version.json"), /no-store/);
});

test("GET /version.json returns the build stamp as JSON with no-store", async () => {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
  const file = path.join(dist, "version.json");
  const had = existsSync(file) ? readFileSync(file, "utf8") : null;
  mkdirSync(dist, { recursive: true });
  writeFileSync(file, JSON.stringify({ version: "test-build-1", builtAt: "2026-10-17T00:00:00Z" }));
  const server = createCaptionServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/version.json?t=1`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    assert.equal((await res.json()).version, "test-build-1");
    rmSync(file);
    const missing = await fetch(`http://127.0.0.1:${port}/version.json`);
    assert.equal(missing.status, 404); // never the SPA shell
    const sw = await fetch(`http://127.0.0.1:${port}/index.html`);
    if (sw.status === 200) assert.equal(sw.headers.get("cache-control"), "no-cache");
  } finally {
    if (had !== null) writeFileSync(file, had);
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
