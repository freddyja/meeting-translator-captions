// Port of fire-fellowship-captions tests/auth.test.ts (#46), vitest -> node:test.
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";
import { WebSocket } from "ws";
import {
  AUTH_COOKIE,
  LOCKOUT_STEPS_MS,
  MAX_FAILS,
  GLOBAL_MAX_FAILS,
  TOKEN_TTL_MS,
  createLoginLimiter,
  issueToken,
  loginLimiter,
  pinConfig,
  pinMatches,
  verifyToken,
} from "../server/auth.ts";
import { createCaptionServer } from "../server/index.ts";

const TEST_PIN = "4826";
let server: Server;
let base = "";
const saved = { ...process.env };

async function start() {
  server = createCaptionServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  delete process.env.APP_PIN;
  delete process.env.APP_PASSWORD;
  delete process.env.APP_SECRET;
  loginLimiter.reset();
  await start();
});

afterEach(async () => {
  process.env = { ...saved };
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
});

const api = (path: string, init: RequestInit = {}) => fetch(`http://${base}${path}`, init);
const login = (pin: unknown, deviceId = "device-aaaa1111", ip = "10.0.0.1") =>
  api("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ pin, deviceId }),
  });

function wsResult(query = ""): Promise<"open" | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${base}/caption-ws${query}`);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join", room: "ABCD", role: "tv" }));
    });
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "joined") {
        ws.terminate();
        resolve("open");
      }
    });
    ws.on("unexpected-response", (_req, res) => {
      resolve(res.statusCode ?? 0);
      ws.terminate();
    });
    ws.on("error", () => resolve(-1));
  });
}

describe("PIN config", () => {
  it("is off when unset or blank, on with 4 digits, fails closed otherwise", () => {
    assert.equal(pinConfig({}).enabled, false);
    assert.equal(pinConfig({ APP_PASSWORD: "  " }).enabled, false);
    assert.deepEqual(pinConfig({ APP_PASSWORD: "1234" }), { enabled: true, pin: "1234" });
    assert.deepEqual(pinConfig({ APP_PIN: "9876", APP_PASSWORD: "1234" }), { enabled: true, pin: "9876" });
    assert.deepEqual(pinConfig({ APP_PIN: " ", APP_PASSWORD: "1234" }), { enabled: true, pin: "1234" });
    assert.deepEqual(pinConfig({ APP_PASSWORD: "12345" }), { enabled: true, pin: null });
    assert.deepEqual(pinConfig({ APP_PASSWORD: "abcd" }), { enabled: true, pin: null });
  });

  it("tokens last 180 days, expire, and changing the PIN signs devices out", () => {
    const env = { APP_PIN: TEST_PIN };
    const now = Date.now();
    const issued = issueToken(env, now)!;
    assert.equal(issued.expiresAt - now, TOKEN_TTL_MS);
    assert.equal(TOKEN_TTL_MS, 180 * 24 * 60 * 60 * 1000);
    assert.equal(verifyToken(issued.token, env, now), true);
    assert.equal(verifyToken(issued.token, env, issued.expiresAt + 1), false);
    assert.equal(verifyToken(issued.token, { APP_PIN: "1111" }, now), false);
    assert.equal(verifyToken(`${issued.token}x`, env, now), false);
  });

  it("APP_SECRET keys tokens independently of the PIN", () => {
    const now = Date.now();
    const issued = issueToken({ APP_PIN: TEST_PIN, APP_SECRET: "s3cret" }, now)!;
    assert.equal(verifyToken(issued.token, { APP_PIN: "1111", APP_SECRET: "s3cret" }, now), true);
    assert.equal(verifyToken(issued.token, { APP_PIN: TEST_PIN, APP_SECRET: "other" }, now), false);
  });

  it("compares PINs in constant time without length leaks", () => {
    assert.equal(pinMatches("4826", "4826"), true);
    assert.equal(pinMatches("4827", "4826"), false);
    assert.equal(pinMatches("", "4826"), false);
  });
});

describe("gate off (no PIN)", () => {
  it("keeps the API and websocket open", async () => {
    assert.equal((await api("/api/translate")).status, 200);
    assert.deepEqual(await (await api("/api/auth")).json(), { required: false, ok: true });
    const off = await login("1234");
    assert.equal(off.status, 200);
    assert.deepEqual(await off.json(), { ok: true, token: "", expiresAt: 0, required: false });
    assert.equal(await wsResult(), "open");
  });
});

describe("gate on", () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = TEST_PIN;
  });

  it("keeps /health and the app shell public", async () => {
    assert.equal((await api("/health")).status, 200);
    assert.notEqual((await api("/")).status, 401);
    assert.deepEqual(await (await api("/api/auth")).json(), { required: true, ok: false });
  });

  it("rejects API calls with a missing or wrong token", async () => {
    assert.equal((await api("/api/translate")).status, 401);
    const post = await api("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi", from: "en", provider: "mock" }),
    });
    assert.equal(post.status, 401);
    assert.deepEqual(await post.json(), { error: "auth", required: true });
    const bad = await api("/api/translate", { headers: { authorization: "Bearer v1.zzzz.nope" } });
    assert.equal(bad.status, 401);
  });

  it("wrong PIN is 401, right PIN returns a token that works for Bearer and the mt_auth cookie", async () => {
    const wrong = await login("0000");
    assert.equal(wrong.status, 401);
    const wrongBody = (await wrong.json()) as Record<string, unknown>;
    assert.equal(wrongBody.error, "wrong_pin");
    assert.equal(wrongBody.remaining, MAX_FAILS - 1);

    assert.equal((await login("12")).status, 400);

    const ok = await login(TEST_PIN);
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { ok: boolean; token: string; expiresAt: number; required: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.required, true);
    assert.match(body.token, /^v1\./);
    assert.ok(body.expiresAt > Date.now());

    const bearer = { authorization: `Bearer ${body.token}` };
    assert.equal((await api("/api/translate", { headers: bearer })).status, 200);
    const cookie = { cookie: `${AUTH_COOKIE}=${encodeURIComponent(body.token)}` };
    assert.equal(AUTH_COOKIE, "mt_auth");
    assert.equal((await api("/api/translate", { headers: cookie })).status, 200);
    assert.deepEqual(await (await api("/api/auth", { headers: bearer })).json(), { required: true, ok: true });
  });

  it("rejects a websocket join without a token and accepts one with it", async () => {
    assert.equal(await wsResult(), 401);
    assert.equal(await wsResult("?auth=v1.zzzz.bad"), 401);
    const { token } = (await (await login(TEST_PIN)).json()) as { token: string };
    assert.equal(await wsResult(`?auth=${encodeURIComponent(token)}`), "open");
  });

  it("locks out after 5 wrong PINs with 429 + Retry-After, even for the right PIN", async () => {
    for (let i = 0; i < MAX_FAILS - 1; i++) assert.equal((await login("0000")).status, 401);
    const fifth = await login("0000");
    assert.equal(fifth.status, 429);
    assert.equal(Number(fifth.headers.get("retry-after")), 60);
    assert.equal(((await fifth.json()) as { retryAfter: number }).retryAfter, 60);
    const blocked = await login(TEST_PIN);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  });

  it("locks per IP even when the device id changes", async () => {
    for (let i = 0; i < MAX_FAILS; i++) await login("0000", `device-rotate-${i}0000`, "10.9.9.9");
    assert.equal((await login(TEST_PIN, "device-fresh-00001", "10.9.9.9")).status, 429);
    // A different IP and device is not affected.
    assert.equal((await login(TEST_PIN, "device-other-00001", "10.1.1.1")).status, 200);
  });

  it("locks per device even when the IP changes", async () => {
    for (let i = 0; i < MAX_FAILS; i++) await login("0000", "device-same-0001", `10.2.0.${i}`);
    assert.equal((await login(TEST_PIN, "device-same-0001", "10.3.0.1")).status, 429);
  });

  it("refuses every login when the PIN is not 4 digits (503, fail closed)", async () => {
    process.env.APP_PASSWORD = "12345";
    const res = await login("1234");
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "pin_misconfigured" });
    assert.equal((await api("/api/translate")).status, 401);
    assert.equal(await wsResult(), 401);
  });
});

describe("lockout schedule", () => {
  it("grows 1 min, 5 min, 15 min, then stays at 15 min", () => {
    const lim = createLoginLimiter();
    const keys = ["ip:1.2.3.4"];
    let now = 1_000_000;
    const seen: number[] = [];
    for (let round = 0; round < 4; round++) {
      let last = { lockedFor: 0, remaining: 0 };
      for (let i = 0; i < MAX_FAILS; i++) {
        assert.equal(lim.lockedFor(keys, now), 0);
        last = lim.fail(keys, now);
        if (i < MAX_FAILS - 1) assert.deepEqual(last, { lockedFor: 0, remaining: MAX_FAILS - 1 - i });
      }
      seen.push(last.lockedFor);
      assert.equal(lim.lockedFor(keys, now + 1000), last.lockedFor - 1000);
      now += last.lockedFor + 1;
    }
    assert.deepEqual(seen, [LOCKOUT_STEPS_MS[0], LOCKOUT_STEPS_MS[1], LOCKOUT_STEPS_MS[2], LOCKOUT_STEPS_MS[2]]);
    assert.deepEqual(LOCKOUT_STEPS_MS, [60_000, 300_000, 900_000]);
  });

  it("success clears strikes; an hour of quiet resets the step", () => {
    const lim = createLoginLimiter();
    const keys = ["dev:abc12345"];
    for (let i = 0; i < MAX_FAILS - 1; i++) lim.fail(keys, 0);
    lim.success(keys);
    assert.deepEqual(lim.fail(keys, 0), { lockedFor: 0, remaining: MAX_FAILS - 1 });

    const k2 = ["ip:5.5.5.5"];
    for (let i = 0; i < MAX_FAILS; i++) lim.fail(k2, 0);
    const later = LOCKOUT_STEPS_MS[0] + 61 * 60_000;
    let r = { lockedFor: 0, remaining: 0 };
    for (let i = 0; i < MAX_FAILS; i++) r = lim.fail(k2, later);
    assert.equal(r.lockedFor, LOCKOUT_STEPS_MS[0]);
  });

  it("caps wrong tries across all callers at 60 per 15 minutes", () => {
    const lim = createLoginLimiter();
    for (let i = 0; i < GLOBAL_MAX_FAILS; i++) lim.fail([`ip:10.0.${Math.floor(i / 4)}.${i % 4}`], 0);
    assert.ok(lim.lockedFor(["ip:192.168.1.1"], 1000) > 0, "a brand-new IP is slowed too");
    assert.equal(lim.lockedFor(["ip:192.168.1.1"], 15 * 60_000 + 1), 0);
  });
});
