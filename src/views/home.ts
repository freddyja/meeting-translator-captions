import { brandBlock, creditFooter } from "../brand";
import {
  canPromptInstall,
  isStandaloneDisplay,
  promptInstall,
  subscribeInstall,
  wasJustInstalled,
} from "../install";
import { bindLocalSetup, localSetupInnerHtml } from "../local-setup";
import { bindOfflineModeToggle } from "../offline-mode";
import { generateRoomCode, isRoomCode, normalizeRoomCode } from "../room";
import { goto } from "../router";

export function mountHome(root: HTMLElement): () => void {
  root.innerHTML = `
    <section class="screen">
      ${brandBlock()}
      <p class="lede">
        Live multilingual meeting captions. A phone captures the speaker; every phone and the TV show English, Spanish, and Portuguese windows.
      </p>
      <div class="stack">
        <button class="primary" data-create type="button">Create room on this phone</button>
        <form class="stack" data-join>
          <label class="field">
            <span>Room code</span>
            <input name="room" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD" />
          </label>
          <button class="secondary" type="submit">Open TV windows</button>
          <button class="secondary" data-join-phone type="button">Join on this phone</button>
        </form>
        <p class="hint">Host: <strong>Chrome</strong> on Android (not Samsung Internet). Guests: scan <strong>Join on phones</strong> in <strong>Chrome on Android</strong> or <strong>Safari / Chrome on iPhone</strong> — no app store install. <strong>Send to TV</strong> opens the caption page in the TV’s own browser. <strong>Smart View mode</strong> mirrors this phone’s caption layout.</p>
        <div class="meeting-mode">
          <p class="control-label">Meeting mode</p>
          <button class="chip" data-offline-mode type="button" aria-pressed="false" aria-label="Offline / Local meeting — use the built-in dictionary, no MyMemory">
            Offline / Local meeting
          </button>
          <p class="offline-banner" data-offline-banner hidden>
            Offline translate (limited phrases). For full local setup see
            <a href="#local-setup">laptop steps</a>.
          </p>
          <p class="hint">On: built-in dictionary (no MyMemory). Off: hosted default (MyMemory, then MinT if the daily quota is gone).</p>
        </div>
      </div>
      <aside class="install-card" id="local-setup" data-local-setup>
        ${localSetupInnerHtml()}
      </aside>
      <aside class="install-card" data-install>
        <h2>Install on this phone</h2>
        <p class="install-copy" data-install-copy></p>
        <button class="primary" data-install-btn type="button" hidden>Install app</button>
        <ol class="install-steps" data-install-steps></ol>
      </aside>
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
  const offlineBtn = root.querySelector("[data-offline-mode]") as HTMLButtonElement;
  const offlineBanner = root.querySelector("[data-offline-banner]") as HTMLElement;
  const localSetup = root.querySelector("[data-local-setup]") as HTMLElement;

  const paintInstall = () => {
    const standalone = isStandaloneDisplay();
    installCard.dataset.state = standalone ? "standalone" : canPromptInstall() ? "ready" : "guide";
    installBtn.hidden = standalone || !canPromptInstall();

    if (standalone) {
      installCopy.textContent =
        "This is the installed Meeting Translator app. Create a room here, then open the TV link on the meeting TV.";
      installSteps.innerHTML = `
        <li>Tap <strong>Create room on this phone</strong>.</li>
        <li>Use <strong>Send to TV</strong> (QR / TV browser) or <strong>Smart View mode</strong> (mirror captions from the phone quick panel).</li>
        <li>Keep this phone on the app while you speak. Exit Smart View mode to return to mic controls.</li>
      `;
      return;
    }

    if (wasJustInstalled()) {
      installCopy.textContent = "Installed. Open Meeting Translator from your home screen.";
      installSteps.innerHTML = `
        <li>Find the <strong>Meeting Translator</strong> icon on the home screen.</li>
        <li>Launch it — you should see this app without the browser address bar.</li>
        <li>Create a room, then open the TV link on the TV.</li>
      `;
      return;
    }

    installCopy.textContent =
      "Add Meeting Translator to the home screen like a normal app. The meeting is then a tap — no git or npm.";
    installSteps.innerHTML = canPromptInstall()
      ? `
        <li>Tap <strong>Install app</strong> above and confirm.</li>
        <li>Open <strong>Meeting Translator</strong> from the home screen (standalone, no address bar).</li>
        <li>Create the room on the phone, then open the TV link on the TV.</li>
      `
      : `
        <li>Stay in <strong>Chrome</strong> on Android (not Samsung Internet). On iPhone, use Safari.</li>
        <li>Tap the browser menu → <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
        <li>Open <strong>Meeting Translator</strong> from the home screen, then create a room.</li>
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
  const unbindOffline = bindOfflineModeToggle(offlineBtn, { banner: offlineBanner });
  const unbindSetup = bindLocalSetup(localSetup);
  paintInstall();

  return () => {
    create?.removeEventListener("click", onCreate);
    input.removeEventListener("input", onInput);
    form?.removeEventListener("submit", onJoin);
    joinPhone?.removeEventListener("click", onJoinPhone);
    installBtn.removeEventListener("click", onInstall);
    unsubscribe();
    unbindOffline();
    unbindSetup();
  };
}
