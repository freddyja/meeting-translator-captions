import { brandBlock, creditFooter } from "../brand";
import { finalizedLines } from "../caption-history";
import { bindUiLang, displaySpeaker, t, uiLangSwitcherHtml } from "../i18n";
import { connectRoom } from "../realtime/client";
import { goto } from "../router";
import { LANG_LABEL, LANG_SHORT, emptyState, type ConnStatus, type Lang, type PeerCounts } from "../types";
import { paintCaptionBoard } from "./caption-board";

export function mountTv(root: HTMLElement, room: string, lang?: Lang): () => void {
  let state = emptyState(room);
  let peers: PeerCounts = { phones: 0, tvs: 1, guests: 0 };
  let connStatus: ConnStatus = "connecting";
  const langLock = lang;

  root.innerHTML = `
    <section class="screen tv-screen${langLock ? " is-lang-lock" : ""}">
      <div class="tv-top">
        ${brandBlock(true)}
        <div class="tv-meta">
          <div class="room-pill"><span data-i18n="roomWord"></span> <strong data-room></strong></div>
          <div class="room-pill" data-lang-pill hidden></div>
          <div class="status-pill"><span class="dot" data-dot></span><span data-status></span></div>
          ${uiLangSwitcherHtml("tv")}
          <button class="ghost" data-home type="button" data-i18n="leave"></button>
        </div>
      </div>
      <main class="tv-board" data-board></main>
      ${creditFooter()}
    </section>
  `;

  const board = root.querySelector("[data-board]") as HTMLElement;
  const roomEl = root.querySelector("[data-room]") as HTMLElement;
  const langPill = root.querySelector("[data-lang-pill]") as HTMLElement;
  const statusEl = root.querySelector("[data-status]") as HTMLElement;
  const dot = root.querySelector("[data-dot]") as HTMLElement;
  const home = root.querySelector("[data-home]");

  const onHome = () => goto("home");
  home?.addEventListener("click", onHome);

  function render() {
    roomEl.textContent = state.room;
    if (langLock) {
      langPill.hidden = false;
      langPill.textContent = `${LANG_SHORT[langLock]} · ${LANG_LABEL[langLock]}`;
    } else {
      langPill.hidden = true;
      langPill.textContent = "";
    }
    const phoneNote =
      state.listening && state.floor?.holderName
        ? t("nameSpeaking", { name: displaySpeaker(state.floor.holderName) })
        : peers.phones > 0
          ? peers.guests > 0
            ? t("phonesConnected", { n: peers.phones })
            : t("phoneConnected")
          : t("waitingForPhone");
    statusEl.textContent = state.listening ? t("liveDot", { note: phoneNote }) : phoneNote;
    dot.className = `dot ${state.listening ? "listening" : connStatus === "live" ? "live" : "offline"}`;
    paintCaptionBoard(board, langLock ? { ...state, layout: langLock } : state);
  }

  const conn = connectRoom({
    room,
    role: "tv",
    onState(next) {
      state = {
        ...next,
        lines: finalizedLines(next.lines ?? []),
      };
      render();
    },
    onPeers(next) {
      peers = next;
      render();
    },
    onStatus(status) {
      connStatus = status;
      render();
    },
  });

  const unbindLang = bindUiLang(root, render);
  render();

  return () => {
    conn.close();
    home?.removeEventListener("click", onHome);
    unbindLang();
  };
}
