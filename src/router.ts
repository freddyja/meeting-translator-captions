import type { Lang, PhoneRole } from "./types";

export type View = "home" | "phone" | "tv" | "join";

export type Route = {
  view: View;
  room: string;
  /** TV-only opt-in. Missing/invalid leaves the room layout unchanged. */
  lang?: Lang;
  /** Phone vs guest join. Host is the phone that created the room. */
  role?: PhoneRole;
};

export function parseTvLang(value: string | null | undefined): Lang | undefined {
  const lang = (value ?? "").trim().toLowerCase();
  if (lang === "en" || lang === "es" || lang === "pt") return lang;
  return undefined;
}

export function parsePhoneRole(value: string | null | undefined): PhoneRole | undefined {
  const role = (value ?? "").trim().toLowerCase();
  if (role === "guest") return "guest";
  if (role === "host") return "host";
  return undefined;
}

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const view = params.get("view");
  const room = (params.get("room") || "").trim().toUpperCase();
  if (view === "join" && room) {
    return { view: "join", room, role: "guest" };
  }
  if (view === "phone" && room) {
    const role = parsePhoneRole(params.get("role")) ?? "host";
    return { view: "phone", room, role };
  }
  if (view === "tv" && room) {
    return {
      view,
      room,
      lang: parseTvLang(params.get("lang")),
    };
  }
  return { view: "home", room };
}

export function readRoute(): Route {
  return parseRoute(location.search);
}

export function tvSearch(room: string, lang?: Lang): string {
  const params = new URLSearchParams({ view: "tv", room });
  if (lang) params.set("lang", lang);
  return params.toString();
}

export function joinSearch(room: string): string {
  return `view=join&room=${encodeURIComponent(room)}`;
}

export function goto(view: View, room = ""): void {
  const url = new URL(location.href);
  if (view === "home") {
    url.search = "";
  } else {
    url.search = new URLSearchParams({ view, room }).toString();
  }
  history.pushState({ view, room }, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function tvUrl(room: string, lang?: Lang): string {
  const url = new URL(location.href);
  url.search = tvSearch(room, lang);
  return url.toString();
}

export function joinUrl(room: string): string {
  const url = new URL(location.href);
  url.search = joinSearch(room);
  return url.toString();
}
