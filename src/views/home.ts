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
import { goto } from "../router";

export function mountHome(root: HTMLElement): () => void {
  root.innerHTML = `
    <section class="screen home-screen">
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
  const onInstall = () => {
    void promptInstall().then(paintInstall);
  };

  create?.addEventListener("click", onCreate);
  input.addEventListener("input", onInput);
  form?.addEventListener("submit", onJoin);
  joinPhone?.addEventListener("click", onJoinPhone);
  installBtn.addEventListener("click", onInstall);
  const unsubscribe = subscribeInstall(paintInstall);
  const unbindLang = bindUiLang(root, paintInstall);
  paintInstall();

  return () => {
    create?.removeEventListener("click", onCreate);
    input.removeEventListener("input", onInput);
    form?.removeEventListener("submit", onJoin);
    joinPhone?.removeEventListener("click", onJoinPhone);
    installBtn.removeEventListener("click", onInstall);
    unsubscribe();
    unbindLang();
  };
}
