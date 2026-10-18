import { hapticMode, hapticsEnabled, setHapticsEnabled } from "./haptics";
import { isAppleMobile } from "./stt/capability";

/** "Vibrate on tap" row for a Settings area. Hidden where no tick is possible. */
export function hapticsToggleHtml(): string {
  return `
    <label class="haptics-toggle" data-haptics-row hidden>
      <input type="checkbox" data-haptics-toggle />
      <span data-i18n="hapticsToggle"></span>
    </label>`;
}

export function bindHapticsToggle(root: HTMLElement): () => void {
  const row = root.querySelector("[data-haptics-row]") as HTMLElement | null;
  const box = root.querySelector("[data-haptics-toggle]") as HTMLInputElement | null;
  if (!row || !box) return () => {};
  row.hidden =
    hapticMode({
      enabled: true,
      reducedMotion: false,
      hasVibrate: typeof navigator.vibrate === "function",
      appleMobile: isAppleMobile(),
      switchSupported: "switch" in HTMLInputElement.prototype,
    }) === "off";
  box.checked = hapticsEnabled();
  const onChange = () => setHapticsEnabled(box.checked);
  box.addEventListener("change", onChange);
  return () => box.removeEventListener("change", onChange);
}
