import type { ConnStatus, FloorState } from "../types.ts";

/** Failed connects in a row before we say the server is waking (Render free tier sleeps). */
export const COLD_START_ATTEMPTS = 2;
/** App-level ping every this often while the socket is open. */
export const CLIENT_PING_MS = 20_000;
/** No message back within this window after a ping means the socket is dead. */
export const PONG_TIMEOUT_MS = 4_000;

/** Exponential backoff, capped, with a little jitter so a room does not reconnect in lockstep. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(8000, 300 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.85 + random() * 0.3));
}

/**
 * Status while the socket is down. Before the first successful join, repeated
 * failures most likely mean a sleeping Render instance, so show "waking".
 */
export function downStatus(failures: number, everJoined: boolean): ConnStatus {
  if (!everJoined && failures >= COLD_START_ATTEMPTS) return "waking";
  return failures === 0 && !everJoined ? "connecting" : "offline";
}

/** We held the speaking turn when the socket dropped, so claim it again on reconnect. */
export function shouldReclaim(floor: FloorState | null | undefined, peerId: string | null): boolean {
  return Boolean(peerId && floor?.holderId === peerId);
}
