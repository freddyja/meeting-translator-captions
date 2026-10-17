import type { IncomingMessage, ServerResponse } from "node:http";
import {
  authEnabled,
  issueToken,
  limiterKeys,
  loginLimiter,
  pinConfig,
  pinMatches,
  requestAuthorized,
} from "./auth.ts";
import { isLang, reportedTranslateProvider, translateCaption } from "./translate.ts";

const MAX_BODY = 8 * 1024;

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extra,
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY) {
      throw Object.assign(new Error("Body too large"), { status: 413 });
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = (req.url ?? "/").split("?")[0] || "/";
  if (pathname === "/api/login") return handleLogin(req, res);
  if (pathname === "/api/auth") return handleAuthStatus(req, res);
  if (pathname.startsWith("/api/") && !requestAuthorized(req)) {
    send(res, 401, { error: "auth", required: true });
    return true;
  }
  if (pathname === "/api/translate") return handleTranslate(req, res);
  return false;
}

async function handleTranslate(req: IncomingMessage, res: ServerResponse): Promise<true> {

  if (req.method === "GET" || req.method === "HEAD") {
    const body = { provider: reportedTranslateProvider() };
    if (req.method === "HEAD") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end();
      return true;
    }
    send(res, 200, body);
    return true;
  }

  if (req.method !== "POST") {
    send(res, 405, { error: "Method not allowed" });
    return true;
  }

  let payload: unknown;
  try {
    payload = await readJson(req);
  } catch (err) {
    const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 400;
    send(res, status || 400, { error: "Invalid JSON" });
    return true;
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const text = typeof body.text === "string" ? body.text : "";
  if (!isLang(body.from)) {
    send(res, 400, { error: "from must be en, es, or pt" });
    return true;
  }

  let targets: Array<"en" | "es" | "pt"> | undefined;
  if (body.to !== undefined) {
    const list = Array.isArray(body.to) ? body.to : [body.to];
    if (!list.every(isLang)) {
      send(res, 400, { error: "to must be en, es, and/or pt" });
      return true;
    }
    targets = list;
  }

  const requestProvider = typeof body.provider === "string" ? body.provider : undefined;

  try {
    const result = await translateCaption(text, body.from, targets, {
      provider: requestProvider,
      trustHint: body.trustHint === true,
    });
    send(res, 200, result);
  } catch (err) {
    const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 502;
    send(res, status || 502, { error: "Translate failed" });
  }
  return true;
}

/** GET /api/auth -> { required, ok }. Public: tells the app whether to show the PIN pad. */
function handleAuthStatus(req: IncomingMessage, res: ServerResponse): true {
  send(res, 200, { required: authEnabled(), ok: requestAuthorized(req) });
  return true;
}

/**
 * POST /api/login { pin: "1234", deviceId?: string }
 *   200 { ok: true, token, expiresAt }       gate on, right PIN (also when gate is off: token "")
 *   400 { error: "pin must be 4 digits" }    not counted as a wrong try
 *   401 { error: "wrong_pin", remaining }    wrong PIN; remaining tries before a lockout
 *   429 { error: "locked", retryAfter }      seconds; also sent as a Retry-After header
 *   503 { error: "pin_misconfigured" }       APP_PIN/APP_PASSWORD is not 4 digits
 */
async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<true> {
  if (req.method !== "POST") {
    send(res, 405, { error: "Method not allowed" });
    return true;
  }
  let payload: unknown;
  try {
    payload = await readJson(req);
  } catch {
    send(res, 400, { error: "Invalid JSON" });
    return true;
  }
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const cfg = pinConfig();
  if (!cfg.enabled) {
    send(res, 200, { ok: true, token: "", expiresAt: 0, required: false });
    return true;
  }
  if (!cfg.pin) {
    send(res, 503, { error: "pin_misconfigured" });
    return true;
  }
  const keys = limiterKeys(req, body.deviceId);
  const locked = loginLimiter.lockedFor(keys);
  if (locked > 0) {
    const retryAfter = Math.ceil(locked / 1000);
    send(res, 429, { error: "locked", retryAfter }, { "retry-after": String(retryAfter) });
    return true;
  }
  const pin = typeof body.pin === "string" ? body.pin.trim() : typeof body.pin === "number" ? String(body.pin) : "";
  if (!/^\d{4}$/.test(pin)) {
    send(res, 400, { error: "pin must be 4 digits" });
    return true;
  }
  if (!pinMatches(pin, cfg.pin)) {
    const { lockedFor, remaining } = loginLimiter.fail(keys);
    if (lockedFor > 0) {
      const retryAfter = Math.ceil(lockedFor / 1000);
      send(res, 429, { error: "locked", retryAfter }, { "retry-after": String(retryAfter) });
    } else {
      send(res, 401, { error: "wrong_pin", remaining });
    }
    return true;
  }
  loginLimiter.success(keys);
  const issued = issueToken();
  send(res, 200, { ok: true, token: issued?.token ?? "", expiresAt: issued?.expiresAt ?? 0, required: true });
  return true;
}
