import { brandBlock, creditFooter } from "../brand";
import { bindUiLang, t, uiLangSwitcherHtml } from "../i18n";
import {
  canPromptInstall,
  isStandaloneDisplay,
  promptInstall,
  subscribeInstall,
  wasJustInstalled,
} from "../install";
import { generateRoomCode, isRoomCode, normalizeRoomCode } from "../room";
import { goto, isToolView } from "../router";
import { hapticMode, hapticsEnabled, setHapticsEnabled } from "../haptics";
import { isAppleMobile } from "../stt/capability";
import { mountInstallBanner, openTour, tourDone } from "./onboarding-ui";

export function mountHome(root: HTMLElement): () => void {
  root.innerHTML = `
    <section class="screen home-screen entry-scene scene-bg">
      ${brandBlock()}
      ${uiLangSwitcherHtml("home")}
      <button class="primary home-create" data-create type="button" data-i18n="createRoom"></button>
      <details class="home-fold">
        <summary data-i18n="haveRoomCode"></summary>
        <form class="home-code" data-join>
          <label class="field">
            <span data-i18n="roomCode"></span>
            <input name="room" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD" />
          </label>
          <button class="secondary" type="submit" data-i18n="openTvWindows"></button>
          <button class="secondary" data-join-phone type="button" data-i18n="joinThisPhone"></button>
        </form>
      </details>
      <details class="home-fold">
        <summary data-i18n="installTitle"></summary>
        <div class="home-fold-body">
          <p class="hint" data-i18n-html="homeHint"></p>
          <aside class="install-card" data-install>
            <p class="install-copy" data-install-copy></p>
            <button class="primary" data-install-btn type="button" hidden data-i18n="installApp"></button>
            <ol class="install-steps" data-install-steps></ol>
          </aside>
        </div>
      </details>
      <section class="more-tools" aria-labelledby="more-tools-title">
        <h2 class="control-label" id="more-tools-title" data-i18n="moreTools"></h2>
        <div class="tool-tiles">
          <button class="tool-tile" data-tool-open="photo" type="button"><span class="tool-icon" aria-hidden="true">📷</span><strong data-i18n="toolPhoto"></strong><small data-i18n="toolPhotoDesc"></small></button>
          <button class="tool-tile" data-tool-open="write" type="button"><span class="tool-icon" aria-hidden="true">✍️</span><strong data-i18n="toolWrite"></strong><small data-i18n="toolWriteDesc"></small></button>
          <button class="tool-tile" data-tool-open="talk" type="button"><span class="tool-icon" aria-hidden="true">💬</span><strong data-i18n="toolTalk"></strong><small data-i18n="toolTalkDesc"></small></button>
        </div>
      </section>
      <div class="home-help">
        <button class="ghost help-link" type="button" data-tour-open data-i18n="helpLink"></button>
        <label class="haptics-toggle" data-haptics-row hidden>
          <input type="checkbox" data-haptics-toggle />
          <span data-i18n="hapticsToggle"></span>
        </label>
      </div>
      ${creditFooter()}
    </section>
  `;

  const create = root.querySelector("[data-create]");
  const form = root.querySelector("[data-join]");
  const joinPhone = root.querySelector("[data-join-phone]");
  const input = root.querySelector("input[name='room']") as HTMLInputElement;
  const installCard = root.querySelector("[data-install]") as HTMLElement;
  const installCopy = root.querySelector("[data-install-copy]") as HTMLElement;
  const installBtn = root.querySelector("[data-install-btn]") as HTMLButtonElement;
  const installSteps = root.querySelector("[data-install-steps]") as HTMLOListElement;

  const paintInstall = () => {
    const standalone = isStandaloneDisplay();
    installCard.dataset.state = standalone ? "standalone" : canPromptInstall() ? "ready" : "guide";
    installBtn.hidden = standalone || !canPromptInstall();

    if (standalone) {
      installCopy.textContent = t("installStandaloneCopy");
      installSteps.innerHTML = `
        <li>${t("installStandalone1")}</li>
        <li>${t("installStandalone2")}</li>
        <li>${t("installStandalone3")}</li>
      `;
      return;
    }

    if (wasJustInstalled()) {
      installCopy.textContent = t("installDoneCopy");
      installSteps.innerHTML = `
        <li>${t("installDone1")}</li>
        <li>${t("installDone2")}</li>
        <li>${t("installDone3")}</li>
      `;
      return;
    }

    installCopy.textContent = t("installGuideCopy");
    installSteps.innerHTML = canPromptInstall()
      ? `
        <li>${t("installReady1")}</li>
        <li>${t("installReady2")}</li>
        <li>${t("installReady3")}</li>
      `
      : `
        <li>${t("installManual1")}</li>
        <li>${t("installManual2")}</li>
        <li>${t("installManual3")}</li>
      `;
  };

  const onCreate = () => goto("phone", generateRoomCode());
  const onInput = () => {
    input.value = normalizeRoomCode(input.value);
  };
  const onJoin = (event: Event) => {
    event.preventDefault();
    const room = normalizeRoomCode(input.value);
    if (!isRoomCode(room)) {
      input.focus();
      return;
    }
    goto("tv", room);
  };
  const onJoinPhone = () => {
    const room = normalizeRoomCode(input.value);
    if (!isRoomCode(room)) {
      input.focus();
      return;
    }
    goto("join", room);
  };
  const tiles = root.querySelector(".tool-tiles") as HTMLElement;
  const onTool = (event: Event) => {
    const view = (event.target as HTMLElement).closest<HTMLElement>("[data-tool-open]")?.dataset.toolOpen;
    if (isToolView(view)) goto(view);
  };
  const onInstall = () => {
    void promptInstall().then(paintInstall);
  };

  create?.addEventListener("click", onCreate);
  input.addEventListener("input", onInput);
  form?.addEventListener("submit", onJoin);
  joinPhone?.addEventListener("click", onJoinPhone);
  installBtn.addEventListener("click", onInstall);
  tiles.addEventListener("click", onTool);
  const screen = root.querySelector(".home-screen") as HTMLElement;
  let closeTour: (() => void) | null = null;
  let unBanner: () => void = () => {};
  const showBanner = () => {
    unBanner();
    unBanner = mountInstallBanner(screen, () => closeTour !== null);
  };
  const startTour = () => {
    if (closeTour) return;
    unBanner();
    closeTour = openTour(screen, () => {
      closeTour = null;
      showBanner();
    });
  };
  const tourBtn = root.querySelector("[data-tour-open]") as HTMLButtonElement;
  tourBtn.addEventListener("click", startTour);
  // Haptics toggle only where a tick is possible (Android vibrate, iOS 18 switch).
  const hapticsRow = root.querySelector("[data-haptics-row]") as HTMLElement;
  const hapticsBox = root.querySelector("[data-haptics-toggle]") as HTMLInputElement;
  hapticsRow.hidden =
    hapticMode({
      enabled: true,
      reducedMotion: false,
      hasVibrate: typeof navigator.vibrate === "function",
      appleMobile: isAppleMobile(),
      switchSupported: "switch" in HTMLInputElement.prototype,
    }) === "off";
  hapticsBox.checked = hapticsEnabled();
  const onHaptics = () => setHapticsEnabled(hapticsBox.checked);
  hapticsBox.addEventListener("change", onHaptics);
  // The home view is never the TV or a room, so first run is safe to show here.
  if (!tourDone()) startTour();
  else showBanner();
  const unsubscribe = subscribeInstall(paintInstall);
  const unbindLang = bindUiLang(root, paintInstall);
  paintInstall();

  return () => {
    create?.removeEventListener("click", onCreate);
    input.removeEventListener("input", onInput);
    form?.removeEventListener("submit", onJoin);
    joinPhone?.removeEventListener("click", onJoinPhone);
    installBtn.removeEventListener("click", onInstall);
    tiles.removeEventListener("click", onTool);
    tourBtn.removeEventListener("click", startTour);
    hapticsBox.removeEventListener("change", onHaptics);
    closeTour?.();
    unBanner();
    unsubscribe();
    unbindLang();
  };
}
