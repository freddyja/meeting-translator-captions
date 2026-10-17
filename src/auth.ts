/**
 * Client side of the optional PIN gate (see server/auth.ts). Port of fire-fellowship-captions#46.
 * The token lives in localStorage so each device enters the PIN once.
 * A TV link from the host carries it in the URL fragment (#k=...), which
 * browsers never send to the server; we store it and strip it right away.
 */

const TOKEN_KEY = "mt-auth-token";
const DEVICE_KEY = "mt-device-id";
export const AUTH_REQUIRED_EVENT = "mt-auth-required";

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readToken(): string {
  try {
    return store()?.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveToken(token: string): void {
  try {
    if (token) store()?.setItem(TOKEN_KEY, token);
    else store()?.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

export function clearToken(): void {
  saveToken("");
}

export function deviceId(): string {
  const s = store();
  try {
    const existing = s?.getItem(DEVICE_KEY);
    if (existing && /^[\w-]{8,64}$/.test(existing)) return existing;
  } catch {
    /* ignore */
  }
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const made = c?.randomUUID ? c.randomUUID() : `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    s?.setItem(DEVICE_KEY, made);
  } catch {
    /* ignore */
  }
  return made;
}

/** Take #k=<token> from a TV/handoff link, save it, and remove it from the address bar. */
export function consumeLinkToken(): void {
  if (typeof location === "undefined" || !location.hash) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("k");
  if (!token) return;
  saveToken(token);
  params.delete("k");
  const rest = params.toString();
  history.replaceState(history.state, "", `${location.pathname}${location.search}${rest ? `#${rest}` : ""}`);
}

/** Add the device token to a share link (fragment only, never the query). */
export function withLinkToken(url: string, token = readToken()): string {
  if (!token) return url;
  const u = new URL(url);
  const params = new URLSearchParams(u.hash.slice(1));
  params.set("k", token);
  u.hash = params.toString();
  return u.toString();
}

export function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const token = readToken();
  return token ? { ...base, authorization: `Bearer ${token}` } : base;
}

/** Websocket query string for the caption relay. */
export function wsAuthQuery(): string {
  const token = readToken();
  return token ? `?auth=${encodeURIComponent(token)}` : "";
}

export function signalAuthRequired(): void {
  clearToken();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}

/** fetch() with the token; a 401 clears it and brings the PIN pad back. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = authHeaders((init.headers as Record<string, string>) ?? {});
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) signalAuthRequired();
  return res;
}

export type AuthStatus = { required: boolean; ok: boolean };

/** null when the server could not be reached (offline): let the app try anyway. */
export async function checkAuth(signal?: AbortSignal): Promise<AuthStatus | null> {
  try {
    const res = await fetch("/api/auth", { headers: authHeaders(), cache: "no-store", signal });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<AuthStatus>;
    return { required: body.required === true, ok: body.ok === true };
  } catch {
    return null;
  }
}

export type LoginResult =
  | { kind: "ok"; token: string }
  | { kind: "wrong"; remaining: number }
  | { kind: "locked"; retryAfter: number }
  | { kind: "error" };

export async function login(pin: string): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin, deviceId: deviceId() }),
    });
  } catch {
    return { kind: "error" };
  }
  const body = (await res.json().catch(() => ({}))) as {
    token?: string;
    remaining?: number;
    retryAfter?: number;
  };
  if (res.ok) {
    saveToken(body.token ?? "");
    return { kind: "ok", token: body.token ?? "" };
  }
  if (res.status === 429) {
    const header = Number(res.headers.get("retry-after"));
    return { kind: "locked", retryAfter: Number(body.retryAfter) || header || 60 };
  }
  if (res.status === 401) return { kind: "wrong", remaining: Math.max(0, Number(body.remaining ?? 0)) };
  return { kind: "error" };
}
