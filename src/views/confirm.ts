import { escapeHtml } from "../dom";
import { t, type MessageKey } from "../i18n";

/**
 * "End meeting?" / "Leave meeting?" sheet. Resolves true only on the confirm
 * button; Stay, Escape, or a tap outside keeps the meeting open.
 */
export function confirmLeave(host: HTMLElement, kind: "end" | "leave"): Promise<boolean> {
  const title: MessageKey = kind === "end" ? "endMeetingQ" : "leaveMeetingQ";
  const body: MessageKey = kind === "end" ? "endMeetingBody" : "leaveMeetingBody";
  const ok: MessageKey = kind === "end" ? "endMeeting" : "leave";
  const dialog = document.createElement("dialog");
  dialog.className = "send-tv-dialog confirm-dialog";
  dialog.setAttribute("data-confirm-leave", kind);
  dialog.setAttribute("aria-labelledby", "confirm-leave-title");
  dialog.innerHTML = `
    <div class="send-tv-sheet confirm-sheet">
      <h2 id="confirm-leave-title">${escapeHtml(t(title))}</h2>
      <p class="confirm-body">${escapeHtml(t(body))}</p>
      <div class="confirm-actions">
        <button class="secondary" type="button" data-confirm-stay>${escapeHtml(t("stayInMeeting"))}</button>
        <button class="primary danger" type="button" data-confirm-ok>${escapeHtml(t(ok))}</button>
      </div>
    </div>`;
  host.append(dialog);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target === dialog || target.closest("[data-confirm-stay]")) finish(false);
      else if (target.closest("[data-confirm-ok]")) finish(true);
    });
    dialog.addEventListener("close", () => finish(false));
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    (dialog.querySelector("[data-confirm-stay]") as HTMLButtonElement | null)?.focus();
  });
}
