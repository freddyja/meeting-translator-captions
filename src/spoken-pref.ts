import { isLang, type Lang } from "./types.ts";

const KEY = "mt-spoken-lang";
const LEGACY_GUEST_KEY = "mt-guest-spoken";

/** This device's mic language. Room snapshots must not replace it. */
export function readSpokenLang(): Lang {
  try {
    const value = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_GUEST_KEY);
    return isLang(value) ? value : "en";
  } catch {
    return "en";
  }
}

export function writeSpokenLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
    localStorage.setItem(LEGACY_GUEST_KEY, lang);
  } catch {
    /* private mode / blocked storage */
  }
}
