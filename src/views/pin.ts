import { login } from "../auth";
import { brandBlock } from "../brand";
import { bindUiLang, t, uiLangSwitcherHtml } from "../i18n";

/** Four-box numeric PIN pad shown before any screen when the server gate is on. Port of fire-fellowship-captions#46. */
export function mountPin(root: HTMLElement, onUnlocked: () => void): () => void {
  root.innerHTML = `
    <section class="screen home-screen entry-scene scene-bg pin-screen">
      ${brandBlock()}
      ${uiLangSwitcherHtml("entry")}
      <form class="pin-card" data-pin-form autocomplete="off">
        <h2 class="pin-title" data-i18n="pinTitle">Enter the meeting PIN</h2>
        <p class="pin-help" data-i18n="pinHelp">Ask the host for the 4-digit PIN. This device will remember it.</p>
        <div class="pin-boxes" role="group" data-i18n-aria="pinTitle" aria-label="Enter the meeting PIN">
          ${[0, 1, 2, 3]
            .map(
              (i) =>
                `<input class="pin-box" data-pin-box="${i}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="${i === 0 ? "one-time-code" : "off"}" aria-label="${t("pinDigit", { n: i + 1 })}" />`,
            )
            .join("")}
        </div>
        <p class="pin-msg" data-pin-msg role="status" aria-live="polite"></p>
        <div class="pin-pad" data-pin-pad>
          ${["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"]
            .map((k) => {
              if (k === "clear") return `<button type="button" class="pin-key pin-key-alt" data-key="clear" data-i18n="pinClear">Clear</button>`;
              if (k === "back") return `<button type="button" class="pin-key pin-key-alt" data-key="back" data-i18n-aria="pinBack" aria-label="Delete">⌫</button>`;
              return `<button type="button" class="pin-key" data-key="${k}">${k}</button>`;
            })
            .join("")}
        </div>
      </form>
    </section>
  `;

  const boxes = [...root.querySelectorAll<HTMLInputElement>("[data-pin-box]")];
  const pad = root.querySelector("[data-pin-pad]") as HTMLElement;
  const form = root.querySelector("[data-pin-form]") as HTMLFormElement;
  const msg = root.querySelector("[data-pin-msg]") as HTMLElement;
  let busy = false;
  let lockedUntil = 0;
  let lockTimer = 0;
  let message: () => string = () => "";

  const paintMsg = () => {
    msg.textContent = message();
  };
  const unbindLang = bindUiLang(root, paintMsg);

  const value = () => boxes.map((b) => b.value).join("");
  const setDisabled = (on: boolean) => {
    boxes.forEach((b) => (b.disabled = on));
    pad.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = on));
  };
  const clear = () => {
    boxes.forEach((b) => (b.value = ""));
    paintFill();
  };
  const paintFill = () => boxes.forEach((b) => b.classList.toggle("filled", Boolean(b.value)));
  const focusNext = () => {
    const next = boxes.find((b) => !b.value) ?? boxes[3];
    if (!("ontouchstart" in window)) next.focus();
  };

  const startLock = (seconds: number) => {
    lockedUntil = Date.now() + seconds * 1000;
    setDisabled(true);
    clear();
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      if (left <= 0) {
        window.clearInterval(lockTimer);
        setDisabled(false);
        message = () => t("pinTryAgainNow");
        paintMsg();
        focusNext();
        return;
      }
      const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      message = () => t("pinLocked", { time });
      paintMsg();
    };
    window.clearInterval(lockTimer);
    lockTimer = window.setInterval(tick, 1000);
    tick();
  };

  const submit = async () => {
    const pin = value();
    if (busy || pin.length !== 4 || Date.now() < lockedUntil) return;
    busy = true;
    setDisabled(true);
    message = () => t("pinChecking");
    paintMsg();
    const result = await login(pin);
    busy = false;
    if (result.kind === "ok") {
      cleanup();
      onUnlocked();
      return;
    }
    if (result.kind === "locked") {
      startLock(result.retryAfter);
      return;
    }
    setDisabled(false);
    clear();
    form.classList.remove("shake");
    void form.offsetWidth;
    form.classList.add("shake");
    if (result.kind === "wrong") {
      const n = result.remaining;
      message = () => t("pinWrong", { n });
    } else {
      message = () => t("pinError");
    }
    paintMsg();
    focusNext();
  };

  const type = (digit: string) => {
    const slot = boxes.find((b) => !b.value);
    if (!slot) return;
    slot.value = digit;
    paintFill();
    if (value().length === 4) void submit();
    else focusNext();
  };
  const back = () => {
    const filled = boxes.filter((b) => b.value);
    const last = filled[filled.length - 1];
    if (last) last.value = "";
    paintFill();
    focusNext();
  };

  const onPad = (event: Event) => {
    const key = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-key]")?.dataset.key;
    if (!key) return;
    if (key === "back") back();
    else if (key === "clear") clear();
    else type(key);
  };
  pad.addEventListener("click", onPad);

  boxes.forEach((box, i) => {
    box.addEventListener("input", () => {
      const digits = box.value.replace(/\D/g, "");
      box.value = "";
      // Paste or OS autofill can drop several digits into one box.
      for (const d of digits.slice(0, 4 - i)) type(d);
      paintFill();
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value) {
        e.preventDefault();
        back();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
    });
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void submit();
  });

  message = () => "";
  focusNext();

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    window.clearInterval(lockTimer);
    pad.removeEventListener("click", onPad);
    unbindLang();
  }
  return cleanup;
}
