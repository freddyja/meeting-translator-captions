import { t } from "../i18n";
import { parseRoute } from "../router";
import { lastCaption, micLive, onActivityChange } from "./activity";
import { busyReason, decideUpdate, type Activity } from "./gate";
import { isNewBuild, parseBuildInfo } from "./version";

const HOURLY_MS = 60 * 60 * 1000;
const IDLE_POLL_MS = 5000;
/** Remembers the build we last auto-reloaded for, so a stale edge cannot loop us. */
const TRIED_KEY = "mt-update-tried";

function roomActive(): boolean {
  const route = parseRoute(location.search);
  return Boolean(route.room) && (route.view === "phone" || route.view === "join" || route.view === "tv");
}

function typing(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === "text")) {
    return el.value.trim().length > 0;
  }
  return false;
}

export function currentActivity(): Activity {
  return { micLive: micLive(), lastCaptionAt: lastCaption(), roomActive: roomActive(), typing: typing(), now: Date.now() };
}

export function initAutoUpdate(): void {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  const current = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
  let reg: ServiceWorkerRegistration | null = null;
  let pending = false;
  let target = "";
  let reloading = false;
  let applying = false;
  let pill: HTMLButtonElement | null = null;
  let idleTimer = 0;
  // The first install claims the page; that is not an update.
  let hadController = Boolean(sw.controller);

  const reload = () => {
    if (reloading) return;
    reloading = true;
    try {
      sessionStorage.setItem(TRIED_KEY, target || "sw");
    } catch {
      /* private mode */
    }
    location.reload();
  };

  const apply = () => {
    applying = true;
    const waiting = reg?.waiting;
    if (waiting) {
      // controllerchange reloads once the new worker has claimed this page.
      waiting.postMessage({ type: "SKIP_WAITING" });
      window.setTimeout(reload, 3000);
    } else {
      reload();
    }
  };

  const showPill = () => {
    if (!pill) {
      pill = document.createElement("button");
      pill.type = "button";
      pill.className = "update-pill";
      pill.setAttribute("data-update-pill", "");
      pill.addEventListener("click", () => {
        if (decideUpdate({ pending, busy: null, tapped: true }) === "reload") apply();
      });
      document.body.append(pill);
    }
    pill.textContent = t("updateReady");
    pill.hidden = false;
  };

  const evaluate = () => {
    if (!pending || applying) return;
    let tried = false;
    try {
      tried = Boolean(target) && sessionStorage.getItem(TRIED_KEY) === target;
    } catch {
      /* ignore */
    }
    const action = decideUpdate({ pending, busy: busyReason(currentActivity()), alreadyTried: tried });
    if (action === "reload") apply();
    else if (action === "pill") {
      showPill();
      if (!idleTimer) idleTimer = window.setInterval(evaluate, IDLE_POLL_MS);
    }
  };

  const markPending = (version?: string) => {
    if (version) target = version;
    pending = true;
    evaluate();
  };

  const watch = (r: ServiceWorkerRegistration) => {
    if (r.waiting && sw.controller) markPending();
    r.addEventListener("updatefound", () => {
      const next = r.installing;
      next?.addEventListener("statechange", () => {
        if (next.state === "installed" && sw.controller) markPending();
      });
    });
  };

  const checkVersion = async () => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const remote = parseBuildInfo(await res.json());
      if (!isNewBuild(current, remote)) return;
      target = remote?.version ?? "";
      // Prefer swapping the worker first so the refresh is a single reload.
      await reg?.update().catch(() => {});
      if (reg?.installing) return; // updatefound -> installed -> markPending
      markPending(target);
    } catch {
      /* offline or Local mode: try again later */
    }
  };

  let lastCheck = 0;
  const check = () => {
    if (!navigator.onLine) return;
    const now = Date.now();
    if (now - lastCheck < 10_000) return; // focus + visibility + pageshow fire together
    lastCheck = now;
    void checkVersion();
  };

  sw.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (applying) reload();
    else markPending();
  });

  const register = () =>
    sw
      .register("/sw.js", { updateViaCache: "none" })
      .then((r) => {
        reg = r;
        watch(r);
        check();
      })
      .catch(() => {
        /* optional */
      });
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("pageshow", check);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  window.setInterval(check, HOURLY_MS);
  // Re-check the gate the moment the mic stops or the route changes.
  onActivityChange(() => window.setTimeout(evaluate, 300));
  window.addEventListener("popstate", () => window.setTimeout(evaluate, 300));
  document.addEventListener("focusout", () => window.setTimeout(evaluate, 300));
}
