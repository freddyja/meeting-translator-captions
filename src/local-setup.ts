import { t } from "./i18n";

export const LOCAL_SETUP_COMMANDS = `npm install
npm run build
npm start`;

export function localSetupInnerHtml(opts?: { heading?: boolean }): string {
  const heading = opts?.heading === false ? "" : `<h2 id="local-setup-title" data-i18n="localTitle"></h2>`;
  return `
    ${heading}
    <p class="install-copy" data-i18n="localIntro"></p>
    <pre class="setup-commands" data-setup-commands><code>${LOCAL_SETUP_COMMANDS}</code></pre>
    <button class="secondary" data-copy-setup type="button" data-i18n="copyCommands"></button>
    <ol class="install-steps">
      <li data-i18n-html="localStep1"></li>
      <li data-i18n-html="localStep2"></li>
      <li data-i18n-html="localStep3"></li>
    </ol>
    <p class="hint" data-this-origin-wrap hidden><span data-i18n="localHereBefore"></span><code data-this-origin></code><span data-i18n="localHereAfter"></span></p>
    <p class="hint" data-i18n-html="localMicHint"></p>
    <p class="hint" data-i18n-html="localOfflineHint"></p>
    <section class="night-checklist">
      <h3 data-i18n="localNightTitle"></h3>
      <ol class="install-steps">
        <li data-i18n-html="localNight1"></li>
        <li data-i18n-html="localNight2"></li>
        <li data-i18n-html="localNight3"></li>
        <li data-i18n-html="localNight4"></li>
        <li data-i18n-html="localNight5"></li>
        <li data-i18n-html="localNight6"></li>
        <li data-i18n-html="localNight7"></li>
      </ol>
    </section>
  `;
}

export function bindLocalSetup(root: HTMLElement): () => void {
  const copyBtn = root.querySelector("[data-copy-setup]") as HTMLButtonElement | null;
  const originEl = root.querySelector("[data-this-origin]") as HTMLElement | null;
  const originWrap = root.querySelector("[data-this-origin-wrap]") as HTMLElement | null;
  if (originEl && originWrap && /^https?:$/.test(window.location.protocol)) {
    originEl.textContent = window.location.origin;
    originWrap.hidden = false;
  }
  if (!copyBtn) return () => {};

  let copyTimer = 0;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(LOCAL_SETUP_COMMANDS);
      copyBtn.textContent = t("copied");
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        copyBtn.textContent = t("copyCommands");
      }, 1600);
    } catch {
      copyBtn.textContent = t("copyCommands");
    }
  };
  copyBtn.addEventListener("click", onCopy);
  return () => {
    window.clearTimeout(copyTimer);
    copyBtn.removeEventListener("click", onCopy);
  };
}
