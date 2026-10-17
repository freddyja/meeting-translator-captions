/** One-time install banner and first-run tour: pure rules plus remembered flags. */
export const INSTALL_DISMISSED_KEY = "mt-install-banner-dismissed";
export const TOUR_DONE_KEY = "mt-tour-done";

export type InstallPlatform = "ios" | "prompt" | "none";

export function installPlatform(opts: { appleMobile: boolean; canPrompt: boolean }): InstallPlatform {
  if (opts.appleMobile) return "ios";
  if (opts.canPrompt) return "prompt";
  return "none";
}

/** Only on the front screen: never on the TV, a room, a tool or under the PIN pad. */
export function shouldShowInstallBanner(opts: {
  view: string;
  standalone: boolean;
  dismissed: boolean;
  platform: InstallPlatform;
  tourOpen: boolean;
}): boolean {
  return opts.view === "home" && !opts.standalone && !opts.dismissed && !opts.tourOpen && opts.platform !== "none";
}

export function shouldShowTour(opts: { view: string; done: boolean }): boolean {
  return opts.view === "home" && !opts.done;
}

export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* private mode: shown again next time, harmless */
  }
}
