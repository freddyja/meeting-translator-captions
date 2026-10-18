import { applyI18n, subscribeUiLang, t, type MessageKey } from "../i18n";
import { canPromptInstall, isStandaloneDisplay, promptInstall, subscribeInstall } from "../install";
import { pinHandled } from "../auth";
import {
  INSTALL_DISMISSED_KEY,
  installPlatform,
  MEETING_USED_KEY,
  readFlag,
  shouldShowInstallBanner,
  TOUR_DONE_KEY,
  tourCards,
  writeFlag,
  type TourCardId,
} from "../onboarding";
import { isAppleMobile } from "../stt/capability";

const SHARE_ICON = `<svg class="ios-share-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/** Safari's bottom bar with Share highlighted, then the sheet's Add to Home Screen row. */
const IOS_ILLUSTRATION = `
<svg class="ios-a2hs-art" viewBox="0 0 280 92" aria-hidden="true">
  <rect x="2" y="50" width="276" height="40" rx="12" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.22)"/>
  <g stroke="#cfe" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".55">
    <path d="M30 70l-6-6 6-6M58 58l6 6-6 6"/><path d="M220 62h14v14h-14zM224 58h14v14"/><path d="M252 64h10M252 70h10M252 76h10"/>
  </g>
  <circle cx="140" cy="70" r="17" fill="rgba(43,179,163,.35)" stroke="#8ee0d4" stroke-width="2"/>
  <g transform="translate(128 57)" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v13M7.5 6.5 12 2l4.5 4.5"/><path d="M8 10H6v11h12V10h-2"/>
  </g>
  <path d="M140 46V30" stroke="#8ee0d4" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 4"/>
  <rect x="70" y="2" width="140" height="26" rx="8" fill="rgba(255,255,255,.95)"/>
  <rect x="80" y="11" width="80" height="8" rx="4" fill="#1d3035" opacity=".75"/>
  <rect x="184" y="7" width="16" height="16" rx="4" fill="none" stroke="#1d3035" stroke-width="2"/>
  <path d="M192 11v8M188 15h8" stroke="#1d3035" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/**
 * Install card on the front screen only, and only after a meeting was used once.
 * It sits in the page flow at the bottom (not fixed), so it never covers a control.
 */
export function mountInstallBanner(host: HTMLElement, isTourOpen: () => boolean): () => void {
  const el = document.createElement("aside");
  el.className = "a2hs-banner";
  el.setAttribute("data-a2hs", "");
  el.setAttribute("role", "region");
  host.append(el);

  const paint = () => {
    const platform = installPlatform({ appleMobile: isAppleMobile(), canPrompt: canPromptInstall() });
    const show = shouldShowInstallBanner({
      view: "home",
      standalone: isStandaloneDisplay(),
      dismissed: readFlag(INSTALL_DISMISSED_KEY),
      platform,
      tourOpen: isTourOpen(),
      meetingUsed: readFlag(MEETING_USED_KEY),
    });
    el.hidden = !show;
    if (!show) return;
    el.dataset.platform = platform;
    el.setAttribute("aria-label", t("bannerTitle"));
    el.innerHTML = `
      <button class="a2hs-close" type="button" data-a2hs-dismiss aria-label="${t("bannerClose")}">✕</button>
      <p class="a2hs-title"><img src="/icon-192.png" alt="" width="28" height="28" /> ${t("bannerTitle")}</p>
      ${
        platform === "ios"
          ? `${IOS_ILLUSTRATION}
             <ol class="a2hs-steps">
               <li>${t("bannerIos1", { icon: SHARE_ICON })}</li>
               <li>${t("bannerIos2")}</li>
               <li>${t("bannerIos3")}</li>
             </ol>
             <button class="ghost a2hs-later" type="button" data-a2hs-dismiss>${t("bannerDismiss")}</button>`
          : `<p class="a2hs-copy">${t("bannerAndroid")}</p>
             <div class="a2hs-actions">
               <button class="primary" type="button" data-a2hs-install data-haptic>${t("bannerInstall")}</button>
               <button class="ghost" type="button" data-a2hs-dismiss>${t("bannerDismiss")}</button>
             </div>`
      }`;
  };

  const onClick = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-a2hs-dismiss]")) {
      writeFlag(INSTALL_DISMISSED_KEY);
      paint();
    } else if (target.closest("[data-a2hs-install]")) {
      void promptInstall().then((outcome) => {
        // Either answer is final: Chrome will not re-offer the prompt soon anyway.
        if (outcome !== "unavailable") writeFlag(INSTALL_DISMISSED_KEY);
        paint();
      });
    }
  };
  el.addEventListener("click", onClick);
  const unInstall = subscribeInstall(paint);
  const unLang = subscribeUiLang(paint);
  paint();
  return () => {
    el.removeEventListener("click", onClick);
    unInstall();
    unLang();
    el.remove();
  };
}

const CARD_COPY: Record<TourCardId, { icon: string; title: MessageKey; body: MessageKey }> = {
  captions: { icon: "💬", title: "tour1Title", body: "tour1Body" },
  create: { icon: "📱", title: "tour2Title", body: "tour2Body" },
  pin: { icon: "🔢", title: "tour3Title", body: "tour3Body" },
  tv: { icon: "📺", title: "tour4Title", body: "tour4Body" },
};

/** Remember that this device has been in a live meeting (unlocks the install card). */
export function markMeetingUsed(): void {
  writeFlag(MEETING_USED_KEY);
}

/**
 * Swipeable walkthrough. Marks itself done on Skip or Get started. The PIN card
 * is left out when this device already entered the PIN (or there is none).
 * Opened on first run from the front screen, and any time from ? Help.
 */
export function openTour(host: HTMLElement, onClose: () => void): () => void {
  const CARDS = tourCards({ pinHandled: pinHandled() }).map((id) => CARD_COPY[id]);
  const el = document.createElement("div");
  el.className = "tour";
  el.setAttribute("data-tour", "");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.innerHTML = `
    <div class="tour-sheet">
      <button class="secondary tour-skip" type="button" data-tour-skip data-i18n="tourSkip"></button>
      <div class="tour-track" data-tour-track>
        ${CARDS.map(
          (c, i) => `
          <section class="tour-card" data-tour-card="${i}" aria-roledescription="slide">
            <div class="tour-icon" aria-hidden="true">${c.icon}</div>
            <h2 data-i18n="${c.title}"></h2>
            <p data-i18n="${c.body}"></p>
          </section>`,
        ).join("")}
      </div>
      <div class="tour-dots" data-tour-dots>${CARDS.map((_, i) => `<span data-dot="${i}"></span>`).join("")}</div>
      <div class="tour-nav">
        <button class="secondary" type="button" data-tour-back data-i18n="tourBack"></button>
        <button class="primary" type="button" data-tour-next data-haptic></button>
      </div>
    </div>`;
  host.append(el);
  const track = el.querySelector("[data-tour-track]") as HTMLElement;
  const next = el.querySelector("[data-tour-next]") as HTMLButtonElement;
  const back = el.querySelector("[data-tour-back]") as HTMLButtonElement;
  let index = 0;

  const paint = () => {
    applyI18n(el);
    el.setAttribute("aria-label", t("tourAria"));
    el.querySelectorAll<HTMLElement>("[data-dot]").forEach((d, i) => d.classList.toggle("on", i === index));
    el.querySelectorAll<HTMLElement>("[data-tour-card]").forEach((c, i) => {
      c.setAttribute("aria-label", t("tourStep", { n: i + 1, total: CARDS.length }));
      c.setAttribute("aria-hidden", String(i !== index));
    });
    back.disabled = index === 0;
    next.textContent = index === CARDS.length - 1 ? t("tourDone") : t("tourNext");
  };
  const go = (i: number) => {
    index = Math.max(0, Math.min(CARDS.length - 1, i));
    track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
    paint();
  };
  const close = () => {
    writeFlag(TOUR_DONE_KEY);
    cleanup();
    onClose();
  };
  const onScroll = () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i !== index) {
      index = i;
      paint();
    }
  };
  const onClick = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-tour-skip]")) close();
    else if (target.closest("[data-tour-next]")) {
      if (index === CARDS.length - 1) close();
      else go(index + 1);
    } else if (target.closest("[data-tour-back]")) go(index - 1);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowRight") go(index + 1);
    else if (event.key === "ArrowLeft") go(index - 1);
  };
  el.addEventListener("click", onClick);
  track.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("keydown", onKey);
  const unLang = subscribeUiLang(paint);
  paint();
  next.focus();

  function cleanup() {
    el.removeEventListener("click", onClick);
    track.removeEventListener("scroll", onScroll);
    document.removeEventListener("keydown", onKey);
    unLang();
    el.remove();
  }
  return cleanup;
}

export function tourDone(): boolean {
  return readFlag(TOUR_DONE_KEY);
}
