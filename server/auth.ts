import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * Optional 4-digit PIN gate. Ported from fire-fellowship-captions#46 (server/auth.ts).
 *
 * - APP_PIN (or APP_PASSWORD) unset/empty  -> gate OFF, app is open as before.
 * - set to exactly 4 digits                -> every API route and the caption
 *   websocket need a token from POST /api/login.
 * - set to anything else                   -> gate stays ON but login is
 *   refused (fail closed) and a warning is logged, so a typo never opens the app.
 *
 * Tokens: "v1.<expiry-ms base36>.<hmac-sha256 base64url>". The HMAC key is
 * APP_SECRET when set, otherwise derived from the PIN, so changing the PIN
 * signs every device out.
 */

/** Cookie alternative to `Authorization: Bearer` (Fire Fellowship uses ff_auth). */
export const AUTH_COOKIE = "mt_auth";

export const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const MAX_FAILS = 5;
/** Lockout after each run of MAX_FAILS wrong PINs: 1 min, 5 min, then 15 min. */
export const LOCKOUT_STEPS_MS = [60_000, 5 * 60_000, 15 * 60_000];
/** A key with no wrong tries for this long starts over at the first step. */
export const FORGET_AFTER_MS = 60 * 60_000;
/** Cap on wrong PINs across all callers, per window. Logged-in devices keep working. */
export const GLOBAL_MAX_FAILS = 60;
export const GLOBAL_WINDOW_MS = 15 * 60_000;

const PIN_RE = /^\d{4}$/;
let warned = false;

export type PinConfig = { enabled: false } | { enabled: true; pin: string | null };

export function pinConfig(env: NodeJS.ProcessEnv = process.env): PinConfig {
  const raw = (env.APP_PIN ?? "").trim() || (env.APP_PASSWORD ?? "").trim();
  if (!raw) return { enabled: false };
  if (!PIN_RE.test(raw)) {
    if (!warned) {
      warned = true;
      console.warn("[auth] APP_PIN/APP_PASSWORD must be exactly 4 digits. Gate is ON and every login is refused until it is fixed.");
    }
    return { enabled: true, pin: null };
  }
  return { enabled: true, pin: raw };
}

export function authEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return pinConfig(env).enabled;
}

function secretKey(pin: string, env: NodeJS.ProcessEnv): Buffer {
  const explicit = (env.APP_SECRET ?? "").trim();
  if (explicit) return createHash("sha256").update(`mt-auth-secret:${explicit}`).digest();
  return createHash("sha256").update(`mt-auth-pin-v1:${pin}`).digest();
}

function sign(body: string, key: Buffer): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function issueToken(env: NodeJS.ProcessEnv = process.env, now = Date.now()): { token: string; expiresAt: number } | null {
  const cfg = pinConfig(env);
  if (!cfg.enabled || !cfg.pin) return null;
  const expiresAt = now + TOKEN_TTL_MS;
  const body = `v1.${expiresAt.toString(36)}`;
  return { token: `${body}.${sign(body, secretKey(cfg.pin, env))}`, expiresAt };
}

export function verifyToken(token: string | null | undefined, env: NodeJS.ProcessEnv = process.env, now = Date.now()): boolean {
  const cfg = pinConfig(env);
  if (!cfg.enabled) return true;
  if (!cfg.pin || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expiresAt = parseInt(parts[1], 36);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  const expected = Buffer.from(sign(`v1.${parts[1]}`, secretKey(cfg.pin, env)));
  const got = Buffer.from(parts[2]);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Constant-time PIN compare (both sides hashed so lengths always match). */
export function pinMatches(candidate: string, pin: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(pin).digest();
  return timingSafeEqual(a, b);
}

/** Token from Authorization: Bearer, the mt_auth cookie, or ?auth= (websocket). */
export function tokenFromRequest(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && /^bearer\s+/i.test(header)) return header.replace(/^bearer\s+/i, "").trim() || null;
  const cookie = req.headers.cookie;
  if (typeof cookie === "string") {
    for (const part of cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === AUTH_COOKIE && v.length) return decodeURIComponent(v.join("="));
    }
  }
  const q = (req.url ?? "").split("?")[1];
  if (q) {
    const auth = new URLSearchParams(q).get("auth");
    if (auth) return auth;
  }
  return null;
}

export function requestAuthorized(req: IncomingMessage, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!authEnabled(env)) return true;
  return verifyToken(tokenFromRequest(req), env);
}

export function clientIp(req: IncomingMessage): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const list = xff.split(",").map((s) => s.trim()).filter(Boolean);
    // Rightmost entry is the one our proxy added; the left side is client-supplied.
    if (list.length) return list[list.length - 1];
  }
  return req.socket?.remoteAddress ?? "unknown";
}

type Strike = { fails: number; level: number; lockedUntil: number; lastFail: number };

export type LoginLimiter = {
  /** Milliseconds left on the longest lockout among keys, or 0. */
  lockedFor(keys: string[], now?: number): number;
  /** Record a wrong PIN. Returns { lockedFor, remaining } for the UI. */
  fail(keys: string[], now?: number): { lockedFor: number; remaining: number };
  success(keys: string[]): void;
  reset(): void;
};

export function createLoginLimiter(): LoginLimiter {
  const strikes = new Map<string, Strike>();
  let globalFails: number[] = [];

  const get = (key: string, now: number): Strike => {
    let s = strikes.get(key);
    if (s && s.lockedUntil <= now && now - s.lastFail > FORGET_AFTER_MS) {
      strikes.delete(key);
      s = undefined;
    }
    if (!s) {
      if (strikes.size > 10_000) strikes.clear();
      s = { fails: 0, level: 0, lockedUntil: 0, lastFail: 0 };
      strikes.set(key, s);
    }
    return s;
  };

  const globalLeft = (now: number): number => {
    globalFails = globalFails.filter((t) => now - t < GLOBAL_WINDOW_MS);
    if (globalFails.length < GLOBAL_MAX_FAILS) return 0;
    return globalFails[0] + GLOBAL_WINDOW_MS - now;
  };

  return {
    lockedFor(keys, now = Date.now()) {
      let left = globalLeft(now);
      for (const key of keys) left = Math.max(left, get(key, now).lockedUntil - now);
      return Math.max(0, left);
    },
    fail(keys, now = Date.now()) {
      globalFails.push(now);
      let lockedFor = 0;
      let remaining = MAX_FAILS;
      for (const key of keys) {
        const s = get(key, now);
        s.fails += 1;
        s.lastFail = now;
        if (s.fails >= MAX_FAILS) {
          const step = LOCKOUT_STEPS_MS[Math.min(s.level, LOCKOUT_STEPS_MS.length - 1)];
          s.lockedUntil = now + step;
          s.level += 1;
          s.fails = 0;
        }
        lockedFor = Math.max(lockedFor, s.lockedUntil - now);
        remaining = Math.min(remaining, MAX_FAILS - s.fails);
      }
      lockedFor = Math.max(lockedFor, globalLeft(now));
      return { lockedFor: Math.max(0, lockedFor), remaining: lockedFor > 0 ? 0 : remaining };
    },
    success(keys) {
      for (const key of keys) strikes.delete(key);
    },
    reset() {
      strikes.clear();
      globalFails = [];
    },
  };
}

export const loginLimiter = createLoginLimiter();

export function limiterKeys(req: IncomingMessage, deviceId: unknown): string[] {
  const keys = [`ip:${clientIp(req)}`];
  if (typeof deviceId === "string" && /^[\w-]{8,64}$/.test(deviceId)) keys.push(`dev:${deviceId}`);
  return keys;
}
