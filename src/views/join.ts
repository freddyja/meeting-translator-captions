import { brandBlock, creditFooter } from "../brand";
import { appendFinalLine, applyFinalLine, finalizedLines } from "../caption-history";
import { connectRoom, type RoomConnection } from "../realtime/client";
import { goto } from "../router";
import { detectSpeechCapability } from "../stt/capability";
import { createWebSpeechProvider, isSpeechFallbackMessage } from "../stt/web-speech";
import { createTranslator, detectLang, translateAll } from "../translate";
import { paintCaptionBoard } from "./caption-board";
import {
  emptyFloor,
  emptyState,
  floorHeldByOther,
  isFloorHolder,
  isLang,
  keepsLocalCaptions,
  lostFloor,
  reconcileFloor,
  LANG_LABEL,
  LANG_SHORT,
  LANGS,
  sanitizePeerName,
  someoneElseSpeaking,
  speechLocale,
  type CaptionLine,
  type ConnStatus,
  type FloorState,
  type Lang,
  type PeerCounts,
} from "../types";

const micIcon = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
  <rect x="9" y="3" width="6" height="11" rx="3"/>
  <path d="M6 11a6 6 0 0 0 12 0"/>
  <path d="M12 17v4M8 21h8"/>
</svg>
`;

const NAME_KEY = "mt-guest-name";

export function mountJoin(root: HTMLElement, room: string): () => void {
  const translator = createTranslator();
  const speech = createWebSpeechProvider();
  const stt = detectSpeechCapability();
  let state = emptyState(room);
  let peers: PeerCounts = { phones: 1, tvs: 0, guests: 1 };
  let connStatus: ConnStatus = "connecting";
  let error = "";
  let conn: RoomConnection | null = null;
  let publishEpoch = 0;
  let hydrated = false;
  let wakeLock: WakeLockSentinel | null = null;
  let liveInterim = "";
  let peerId: string | null = null;
  let floor: FloorState = emptyFloor();
  let sourceLang: Lang = "en";
  let displayName = readGuestName();
  let lastCaptionWasMock = false;
  let typeFallback = stt.preferType;
  let pendingFinal = "";

  const push = () =>
    conn?.push({
      ...state,
      sourceLang,
      floor,
      listening: state.listening,
    });

  root.innerHTML = `
    <section class="screen join-screen" data-join-screen>
      <div class="tv-top">
        ${brandBlock(true)}
        <div class="tv-meta">
          <div class="room-pill">Room <strong data-room></strong></div>
          <div class="status-pill"><span class="dot" data-dot></span><span data-status></span></div>
          <button class="ghost" data-home type="button">Leave</button>
        </div>
      </div>
      <p class="floor-banner" data-floor></p>
      <div class="join-main">
        <main class="tv-board" data-board></main>
      </div>
      <div class="join-dock">
        <p class="smart-view-tip" data-stt-hint></p>
        <label class="join-name">
          <span>Your name</span>
          <input data-name maxlength="24" autocomplete="name" placeholder="Guest" enterkeyhint="done" />
        </label>
        <div>
          <p class="control-label">Spoken language</p>
          <div class="chips" data-source></div>
        </div>
        <div class="smart-view-controls join-actions">
          <button class="smart-view-mic" data-mic type="button" aria-pressed="false">
            ${micIcon}
            <small data-mic-label>Start</small>
          </button>
        </div>
        <p class="hint" data-error></p>
        <form class="typed-caption join-type" data-type>
          <input name="caption" autocomplete="off" autocorrect="on" autocapitalize="sentences" enterkeyhint="send" placeholder="Type a caption" />
          <button class="primary" type="submit">Send</button>
        </form>
        ${creditFooter()}
      </div>
    </section>
  `;

  const sourceBox = root.querySelector("[data-source]") as HTMLElement;
  sourceBox.innerHTML = LANGS.map(
    (lang) => `<button class="chip" type="button" data-lang="${lang}">${LANG_SHORT[lang]} ${LANG_LABEL[lang]}</button>`,
  ).join("");

  const typeForm = root.querySelector("[data-type]") as HTMLFormElement;
  const typeInput = typeForm.elements.namedItem("caption") as HTMLInputElement;
  const typeSend = typeForm.querySelector("button[type='submit']") as HTMLButtonElement;
  const screenEl = root.querySelector("[data-join-screen]") as HTMLElement;
  const board = root.querySelector("[data-board]") as HTMLElement;
  const nameInput = root.querySelector("[data-name]") as HTMLInputElement;
  const sttHint = root.querySelector("[data-stt-hint]") as HTMLElement;
  const landscapeMq = window.matchMedia("(orientation: landscape)");
  nameInput.value = displayName;

  const els = {
    room: root.querySelector("[data-room]") as HTMLElement,
    status: root.querySelector("[data-status]") as HTMLElement,
    dot: root.querySelector("[data-dot]") as HTMLElement,
    mic: root.querySelector("[data-mic]") as HTMLButtonElement,
    micLabel: root.querySelector("[data-mic-label]") as HTMLElement,
    error: root.querySelector("[data-error]") as HTMLElement,
    floor: root.querySelector("[data-floor]") as HTMLElement,
  };

  const syncOrientation = () => {
    const landscape = landscapeMq.matches || window.innerWidth > window.innerHeight;
    screenEl.dataset.orientation = landscape ? "landscape" : "portrait";
  };

  function sttHintText(): string {
    if (stt.insecure) {
      return "This join link must be HTTPS for the microphone. You can still watch captions and type to send.";
    }
    if (!stt.canListen) {
      return "Live mic needs Chrome on Android. On iPhone you can always watch — type a caption to speak.";
    }
    if (stt.preferType) {
      return "If the mic does not start (common on iPhone Safari), type a caption instead. One person at a time.";
    }
    return "Same meeting as the host phone and the TV. One person speaks at a time.";
  }

  function renderDynamic() {
    const holding = isFloorHolder(floor, peerId);
    const blocked = floorHeldByOther(floor, peerId);
    const showMic = stt.canListen;
    els.room.textContent = state.room;
    const guestNote = peers.guests > 0 ? `${peers.guests} on phones` : "Joined";
    const tvNote = peers.tvs > 0 ? ` · TV connected (${peers.tvs})` : "";
    const connNote =
      connStatus === "live" ? `${guestNote}${tvNote}` : connStatus === "connecting" ? "Connecting…" : "Reconnecting…";
    els.status.textContent = holding && state.listening ? `Listening · ${connNote}` : connNote;
    els.dot.className = `dot ${holding && state.listening ? "listening" : connStatus === "live" ? "live" : "offline"}`;
    els.mic.hidden = !showMic;
    els.mic.classList.toggle("hot", holding && state.listening);
    els.mic.disabled = blocked;
    els.mic.setAttribute("aria-pressed", String(holding && state.listening));
    els.micLabel.textContent = holding ? "Stop" : blocked ? "Wait" : "Start";
    if (blocked) {
      els.floor.textContent = someoneElseSpeaking(floor);
    } else if (holding && state.listening) {
      els.floor.textContent = typeFallback
        ? "You have the floor — speak if the mic works, or type a caption."
        : "You're speaking — captions go to every phone and the TV.";
    } else if (holding) {
      els.floor.textContent = "You have the mic. Type a caption, or Stop to free the floor.";
    } else if (!showMic) {
      els.floor.textContent = "Mic is free. Type a caption to send it to every phone and the TV.";
    } else {
      els.floor.textContent = "Mic is free. Pick a spoken language, then Start — or type a caption.";
    }
    els.floor.hidden = false;
    sttHint.textContent = sttHintText();
    const extra = lastCaptionWasMock ? "Offline translate (limited phrases)." : "";
    els.error.textContent = [error, extra].filter(Boolean).join(" ");
    typeForm.classList.toggle("is-primary", typeFallback || !showMic);
    typeInput.disabled = blocked;
    typeSend.disabled = blocked;
    typeInput.placeholder = blocked ? "Wait — someone else is speaking" : typeFallback || !showMic ? "Type a caption" : "Or type a caption";
    for (const btn of sourceBox.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
      btn.classList.toggle("active", btn.dataset.lang === sourceLang);
    }
    paintCaptionBoard(
      board,
      { layout: state.layout, lines: finalizedLines(state.lines) },
      liveInterim && holding ? { text: liveInterim, sourceLang } : null,
    );
    syncOrientation();
  }

  const releaseWake = () => {
    void wakeLock?.release();
    wakeLock = null;
  };

  const requestWake = async () => {
    try {
      wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      /* not available on many iPhones / background tabs */
    }
  };

  const stopLocalMic = () => {
    speech.stop();
    releaseWake();
    liveInterim = "";
    state = { ...state, listening: false, floor };
  };

  const onMic = () => {
    void (async () => {
      error = "";
      if (!stt.canListen) {
        typeFallback = true;
        typeInput.focus();
        renderDynamic();
        return;
      }
      if (isFloorHolder(floor, peerId)) {
        stopLocalMic();
        pendingFinal = "";
        await conn?.releaseFloor();
        renderDynamic();
        push();
        return;
      }
      if (floorHeldByOther(floor, peerId)) {
        error = someoneElseSpeaking(floor);
        renderDynamic();
        return;
      }
      // iOS Safari only allows SpeechRecognition.start() in the click turn.
      // Claim the floor after start — an await first makes the mic a silent no-op.
      error = "";
      speech.setLang(speechLocale(sourceLang));
      speech.start();
      const ok = (await conn?.claimFloor(displayName)) ?? false;
      if (!ok) {
        speech.stop();
        pendingFinal = "";
        error = someoneElseSpeaking(floor);
        renderDynamic();
        return;
      }
      if (micFailed(error)) {
        stopLocalMic();
        typeFallback = true;
        typeInput.focus();
        state = { ...state, listening: false, sourceLang, floor };
        renderDynamic();
        return;
      }
      void requestWake();
      state = { ...state, listening: true, sourceLang, floor };
      renderDynamic();
      push();
      const queued = pendingFinal.trim();
      pendingFinal = "";
      if (queued) void publishFinal(queued);
    })();
  };

  async function publishFinal(text: string, coalesce = true) {
    const spoken = text.trim();
    if (!spoken) return;
    if (floorHeldByOther(floor, peerId)) {
      error = someoneElseSpeaking(floor);
      renderDynamic();
      return;
    }
    if (!isFloorHolder(floor, peerId)) {
      const ok = (await conn?.claimFloor(displayName)) ?? false;
      if (!ok || !isFloorHolder(floor, peerId)) {
        error = someoneElseSpeaking(floor);
        renderDynamic();
        return;
      }
      state = { ...state, listening: true, sourceLang, floor };
      push();
    }
    error = "";
    liveInterim = "";
    renderDynamic();
    const epoch = publishEpoch;
    const from = detectLang(spoken, sourceLang);
    const translated = await translateAll(translator, spoken, from);
    if (epoch !== publishEpoch) return;
    lastCaptionWasMock = translator.id === "mock";
    const line: CaptionLine = {
      id: crypto.randomUUID(),
      isFinal: true,
      text: translated,
      at: Date.now(),
    };
    const lines = coalesce
      ? applyFinalLine(state.lines, line, from)
      : appendFinalLine(state.lines, line);
    state = { ...state, lines, sourceLang, floor, listening: true };
    renderDynamic();
    push();
  }

  speech.onResult = (result) => {
    error = "";
    if (result.isFinal) {
      if (isFloorHolder(floor, peerId)) {
        pendingFinal = "";
        void publishFinal(result.text);
      } else if (!floorHeldByOther(floor, peerId)) {
        pendingFinal = result.text;
      } else {
        error = someoneElseSpeaking(floor);
        renderDynamic();
      }
      return;
    }
    if (!isFloorHolder(floor, peerId)) return;
    const next = result.text.trim();
    if (next === liveInterim) return;
    liveInterim = next;
    renderDynamic();
  };
  speech.onError = (message) => {
    error = message;
    typeFallback = true;
    pendingFinal = "";
    stopLocalMic();
    typeInput.focus();
    renderDynamic();
  };

  const onSource = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-lang]");
    if (!btn?.dataset.lang) return;
    const next = btn.dataset.lang as Lang;
    if (!isLang(next)) return;
    sourceLang = next;
    speech.setLang(speechLocale(sourceLang));
    if (isFloorHolder(floor, peerId)) {
      state = { ...state, sourceLang };
      push();
    }
    renderDynamic();
  };

  const onName = () => {
    displayName = sanitizePeerName(nameInput.value, "Guest");
    writeGuestName(displayName);
    nameInput.value = displayName;
  };

  const onHome = () => {
    speech.stop();
    releaseWake();
    void conn?.releaseFloor();
    goto("home");
  };

  const onType = (event: Event) => {
    event.preventDefault();
    void (async () => {
      const text = typeInput.value.trim();
      if (!text) return;
      if (floorHeldByOther(floor, peerId)) {
        error = someoneElseSpeaking(floor);
        renderDynamic();
        return;
      }
      if (!isFloorHolder(floor, peerId)) {
        const ok = (await conn?.claimFloor(displayName)) ?? false;
        if (!ok) {
          error = someoneElseSpeaking(floor);
          renderDynamic();
          return;
        }
        state = { ...state, listening: true, sourceLang, floor };
        push();
      }
      typeInput.value = "";
      void publishFinal(text, false);
    })();
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible" && state.listening) void requestWake();
  };

  const onOrientationChange = () => syncOrientation();
  landscapeMq.addEventListener("change", onOrientationChange);
  window.addEventListener("resize", onOrientationChange);
  window.addEventListener("orientationchange", onOrientationChange);
  syncOrientation();

  els.mic.addEventListener("click", onMic);
  document.addEventListener("visibilitychange", onVisibility);
  sourceBox.addEventListener("click", onSource);
  nameInput.addEventListener("change", onName);
  root.querySelector("[data-home]")?.addEventListener("click", onHome);
  typeForm.addEventListener("submit", onType);

  conn = connectRoom({
    room,
    role: "guest",
    name: displayName,
    onJoined(info) {
      peerId = info.peerId;
      floor = info.floor ?? floor;
      renderDynamic();
    },
    onFloor(next) {
      const lost = lostFloor(floor, next, peerId);
      floor = next;
      if (lost) {
        publishEpoch += 1;
        pendingFinal = "";
        stopLocalMic();
        error = someoneElseSpeaking(next);
      } else if (isFloorHolder(next, peerId) && error.startsWith("Someone else is speaking")) {
        error = "";
      }
      state = { ...state, floor: next };
      renderDynamic();
    },
    onState(next) {
      const holding = keepsLocalCaptions(floor, next.floor, peerId);
      floor = reconcileFloor(floor, next.floor, peerId);
      state = {
        ...next,
        room,
        floor,
        sourceLang: holding ? sourceLang : isLang(next.sourceLang) ? next.sourceLang : sourceLang,
        listening: holding ? state.listening : Boolean(next.listening),
        lines: holding ? state.lines : finalizedLines(next.lines ?? []),
      };
      if (!hydrated) {
        hydrated = true;
        if (isLang(next.sourceLang) && !holding) sourceLang = next.sourceLang;
      }
      renderDynamic();
    },
    onPeers(next) {
      peers = next;
      renderDynamic();
    },
    onStatus(status) {
      connStatus = status;
      renderDynamic();
    },
  });

  renderDynamic();

  return () => {
    speech.stop();
    releaseWake();
    conn?.close();
    landscapeMq.removeEventListener("change", onOrientationChange);
    window.removeEventListener("resize", onOrientationChange);
    window.removeEventListener("orientationchange", onOrientationChange);
    document.removeEventListener("visibilitychange", onVisibility);
    els.mic.removeEventListener("click", onMic);
    sourceBox.removeEventListener("click", onSource);
    nameInput.removeEventListener("change", onName);
    typeForm.removeEventListener("submit", onType);
  };
}

function micFailed(message: string): boolean {
  return isSpeechFallbackMessage(message);
}

function readGuestName(): string {
  try {
    return sanitizePeerName(sessionStorage.getItem(NAME_KEY), "Guest");
  } catch {
    return "Guest";
  }
}

function writeGuestName(value: string) {
  try {
    sessionStorage.setItem(NAME_KEY, value);
  } catch {
    /* private mode / blocked storage */
  }
}
