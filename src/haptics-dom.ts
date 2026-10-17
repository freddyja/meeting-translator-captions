import { HAPTIC_SELECTOR, hapticMode, hapticsEnabled } from "./haptics";
import { isAppleMobile } from "./stt/capability";

let switchLabel: HTMLLabelElement | null = null;

function iosTick() {
  if (!switchLabel) {
    switchLabel = document.createElement("label");
    switchLabel.setAttribute("aria-hidden", "true");
    switchLabel.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9px;top:-9px";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    switchLabel.append(input);
    document.body.append(switchLabel);
  }
  switchLabel.click();
}

export function tick(): void {
  const mode = hapticMode({
    enabled: hapticsEnabled(),
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    hasVibrate: typeof navigator.vibrate === "function",
    appleMobile: isAppleMobile(),
    switchSupported: "switch" in HTMLInputElement.prototype,
  });
  if (mode === "vibrate") navigator.vibrate(12);
  else if (mode === "ios-switch") iosTick();
}

/**
 * Delegated, so views need no wiring. Enabled state is read in the capture phase
 * (a PIN key's handler disables the pad), the tick fires in the bubble phase so the
 * view's own handler, including iOS recognition.start(), runs first.
 */
export function initHaptics(): void {
  let armed: Element | null = null;
  document.addEventListener(
    "click",
    (event) => {
      const el = (event.target as Element | null)?.closest?.(HAPTIC_SELECTOR) ?? null;
      armed = el && !(el as HTMLButtonElement).disabled ? el : null;
    },
    true,
  );
  document.addEventListener("click", () => {
    if (!armed) return;
    armed = null;
    tick();
  });
}
