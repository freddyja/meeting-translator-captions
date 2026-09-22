export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Listener = () => void;

let deferred: BeforeInstallPromptEvent | null = null;
let installedThisSession = false;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export function initInstallCapture(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedThisSession = true;
    notify();
  });
}

export function subscribeInstall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function wasJustInstalled(): boolean {
  return installedThisSession;
}

export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export async function promptInstall(): Promise<InstallOutcome> {
  if (!deferred) return "unavailable";
  const event = deferred;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") installedThisSession = true;
  notify();
  return outcome;
}
