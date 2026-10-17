/** Light tap feedback on the main buttons. Off with the setting or reduced motion. */
export const HAPTICS_KEY = "mt-haptics";

export type HapticMode = "vibrate" | "ios-switch" | "off";

export function hapticMode(opts: {
  enabled: boolean;
  reducedMotion: boolean;
  hasVibrate: boolean;
  appleMobile: boolean;
  switchSupported: boolean;
}): HapticMode {
  if (!opts.enabled || opts.reducedMotion) return "off";
  if (opts.hasVibrate) return "vibrate";
  // iOS 18+ Safari ticks when a <input type=checkbox switch> is toggled via its label.
  if (opts.appleMobile && opts.switchSupported) return "ios-switch";
  return "off";
}

/** Buttons that tick: mic, Send, Swap, Create/Join, PIN keys, Two-person start. */
export const HAPTIC_SELECTOR = [
  "[data-mic]",
  "[data-talk-start]",
  "[data-talk-who-lang]",
  "button[type=submit]",
  "[data-swap]",
  "[data-create]",
  "[data-join-phone]",
  ".pin-key",
  "[data-haptic]",
].join(",");

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(HAPTICS_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
