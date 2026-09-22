export type Lang = "en" | "es" | "pt";
export type Role = "phone" | "tv" | "guest";
export type PhoneRole = "host" | "guest";
export type Layout = "en" | "es" | "pt" | "en-es" | "en-pt" | "es-pt" | "en-es-pt";
export type ConnStatus = "connecting" | "live" | "offline";
export type FloorState = {
  holderId: string | null;
  holderName: string | null;
};

export type CaptionLine = {
  id: string;
  isFinal: boolean;
  text: Record<Lang, string>;
  at: number;
};

export type RoomState = {
  room: string;
  layout: Layout;
  sourceLang: Lang;
  listening: boolean;
  lines: CaptionLine[];
  floor: FloorState;
};

export type PeerCounts = {
  phones: number;
  tvs: number;
  guests: number;
};

export const LANGS: Lang[] = ["en", "es", "pt"];

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "es" || value === "pt";
}

/** Personal caption panes on a join phone. Never sent as the room layout. */
export type WatchLang = Lang | "all";

export function isWatchLang(value: unknown): value is WatchLang {
  return value === "all" || isLang(value);
}

export const LANG_LABEL: Record<Lang, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

export const LANG_SHORT: Record<Lang, string> = {
  en: "EN",
  es: "ES",
  pt: "PT",
};

export const LAYOUTS: { id: Layout; label: string; langs: Lang[] }[] = [
  { id: "en", label: "English", langs: ["en"] },
  { id: "es", label: "Español", langs: ["es"] },
  { id: "pt", label: "Português", langs: ["pt"] },
  { id: "en-es", label: "EN | ES", langs: ["en", "es"] },
  { id: "en-pt", label: "EN | PT", langs: ["en", "pt"] },
  { id: "es-pt", label: "ES | PT", langs: ["es", "pt"] },
  { id: "en-es-pt", label: "EN | ES | PT", langs: ["en", "es", "pt"] },
];

export const MAX_LINES = 8;

export function langsForLayout(layout: Layout): Lang[] {
  return LAYOUTS.find((item) => item.id === layout)?.langs ?? ["en", "es", "pt"];
}

/** Panes a join phone shows for its Watch preference. Independent of the room layout. */
export function langsForWatch(watch: WatchLang): Lang[] {
  if (watch === "all") return [...LANGS];
  return [watch];
}

export function emptyFloor(): FloorState {
  return { holderId: null, holderName: null };
}

export function emptyState(room: string): RoomState {
  return {
    room,
    layout: "en-es-pt",
    sourceLang: "en",
    listening: false,
    lines: [],
    floor: emptyFloor(),
  };
}

export function sanitizePeerName(value: unknown, fallback = "Guest"): string {
  const name = String(value ?? "")
    .replace(/[\u0000-\u001f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  return name || fallback;
}

export function isFloorHolder(floor: FloorState | null | undefined, peerId: string | null | undefined): boolean {
  return Boolean(peerId && floor?.holderId === peerId);
}

export function floorHeldByOther(floor: FloorState | null | undefined, peerId: string | null | undefined): boolean {
  if (!floor?.holderId || !peerId) return false;
  return floor.holderId !== peerId;
}

/** True when this phone should keep its in-progress lines.
 * A named incoming holder wins over a stale local floor, so a guest caption
 * is applied even if this phone still thinks it has the mic.
 * An empty incoming floor does not wipe lines while we still hold.
 */
export function keepsLocalCaptions(
  local: FloorState | null | undefined,
  incoming: FloorState | null | undefined,
  peerId: string | null | undefined,
): boolean {
  if (incoming?.holderId) return incoming.holderId === peerId;
  return isFloorHolder(local, peerId);
}

/** Prefer a named incoming holder. Ignore an empty snapshot while we still hold. */
export function reconcileFloor(
  local: FloorState | null | undefined,
  incoming: FloorState | null | undefined,
  peerId: string | null | undefined,
): FloorState {
  if (incoming?.holderId) return { holderId: incoming.holderId, holderName: incoming.holderName ?? null };
  if (isFloorHolder(local, peerId)) return { holderId: local?.holderId ?? null, holderName: local?.holderName ?? null };
  return {
    holderId: incoming?.holderId ?? local?.holderId ?? null,
    holderName: incoming?.holderName ?? local?.holderName ?? null,
  };
}

/** Someone else took the floor. Our own Stop (floor goes empty) is not a loss. */
export function lostFloor(
  previous: FloorState | null | undefined,
  next: FloorState | null | undefined,
  peerId: string | null | undefined,
): boolean {
  return isFloorHolder(previous, peerId) && Boolean(next?.holderId) && next?.holderId !== peerId;
}

export function someoneElseSpeaking(floor: FloorState | null | undefined): string {
  const name = floor?.holderName?.trim();
  if (!name) return "Someone else is speaking";
  return `Someone else is speaking · ${name}`;
}

export function speechLocale(lang: Lang): string {
  if (lang === "es") return "es-ES";
  if (lang === "pt") return "pt-BR";
  return "en-US";
}
