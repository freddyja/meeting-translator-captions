export const LOCAL_SETUP_COMMANDS = `npm install
npm run build
npm start`;

export function localSetupInnerHtml(opts?: { heading?: boolean }): string {
  const heading =
    opts?.heading === false ? "" : `<h2 id="local-setup-title">Laptop LAN / hotspot</h2>`;
  return `
    ${heading}
    <p class="install-copy">No public internet? Run the app on a laptop. Phones and the TV open that laptop on the same Wi‑Fi or phone hotspot.</p>
    <pre class="setup-commands" data-setup-commands><code>${LOCAL_SETUP_COMMANDS}</code></pre>
    <button class="secondary" data-copy-setup type="button">Copy commands</button>
    <ol class="install-steps">
      <li>On the laptop, in this repo, paste those three commands. <code>npm start</code> listens on port <strong>8080</strong> (<code>HOST=0.0.0.0</code>).</li>
      <li>Find the laptop’s LAN IP (macOS: System Settings → Wi‑Fi → Details; Windows: <code>ipconfig</code>; Linux: <code>ip addr</code>).</li>
      <li>On each phone and the TV, open <code>http://LAPTOP-LAN-IP:PORT</code> — usually <code>http://192.168.x.x:8080</code> — while they share that Wi‑Fi or hotspot.</li>
    </ol>
    <p class="hint" data-this-origin-wrap hidden>This device is already on <code data-this-origin></code> — use that URL on the phones and TV if they share this network.</p>
    <p class="hint">Use <strong>Chrome</strong> for the mic. Speech recognition may still need a network path to the device’s speech service (Chrome / Google), depending on the phone. That is not fully offline. <strong>Type a caption</strong> and Send if the mic cannot reach a recognizer.</p>
    <p class="hint">Turn on <strong>Offline / Local meeting</strong> so captions use the built-in dictionary (no MyMemory). Optional laptop env: <code>TRANSLATE_PROVIDER=mock</code>.</p>
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
      copyBtn.textContent = "Copied";
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        copyBtn.textContent = "Copy commands";
      }, 1600);
    } catch {
      copyBtn.textContent = "Copy commands";
    }
  };
  copyBtn.addEventListener("click", onCopy);
  return () => {
    window.clearTimeout(copyTimer);
    copyBtn.removeEventListener("click", onCopy);
  };
}
