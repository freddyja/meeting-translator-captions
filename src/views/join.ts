import { brandBlock, creditFooter } from "../brand";
import { appendFinalLine, applyFinalLine, finalizedLines } from "../caption-history";
import { escapeHtml } from "../dom";
import {
  bindUiLang,
  canonicalRole,
  displayCopy,
  displayRole,
  isDefaultRole,
  t,
  uiLangSwitcherHtml,
  watchChipsHtml,
} from "../i18n";
import { connectRoom, type RoomConnection } from "../realtime/client";
import { goto } from "../router";
import { detectSpeechCapability } from "../stt/capability";
import { createWebSpeechProvider, isNonFatalSpeechNote, isSpeechFallbackMessage } from "../stt/web-speech";
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
  isWatchLang,
  langsForWatch,
  captionSpeakerName,
  sanitizePeerName,
  someoneElseSpeaking,
  speechLocale,
  type CaptionLine,
  type ConnStatus,
  type FloorState,
  type Lang,
  type PeerCounts,
  type WatchLang,
} from "../types";

const micIcon = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
  <rect x="9" y="3" width="6" height="11" rx="3"/>
  <path d="M6 11a6 6 0 0 0 12 0"/>
  <path d="M12 17v4M8 21h8"/>
</svg>
`;

const NAME_KEY = "mt-guest-name";
const WATCH_KEY = "mt-guest-watch";
const SPOKEN_KEY = "mt-guest-spoken";

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
  let wakeLock: WakeLockSentinel | null = null;
  let liveInterim = "";
  let peerId: string | null = null;
  let floor: FloorState = emptyFloor();
  let sourceLang: Lang = readSpokenLang();
  let watchLang: WatchLang = readWatchLang();
  let displayName = readGuestName();
  let entered = false;
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
    <section class="screen join-setup entry-scene scene-bg" data-join-setup>
      ${brandBlock(true)}
      <p class="join-room"><span data-i18n="roomWord"></span> <strong>${escapeHtml(room)}</strong></p>
      ${uiLangSwitcherHtml("entry")}
      <label class="join-name">
        <span data-i18n="yourName"></span>
        <input data-setup-name maxlength="24" autocomplete="name" data-i18n-placeholder="optional" enterkeyhint="done" />
      </label>
      <fieldset class="join-setup-q">
        <legend id="join-spoken-q" data-i18n="spokenShort"></legend>
        <div class="chips" data-setup-source role="group" aria-labelledby="join-spoken-q"></div>
      </fieldset>
      <fieldset class="join-setup-q">
        <legend id="join-watch-q" data-i18n="watch"></legend>
        <div class="chips join-setup-watch" data-setup-watch role="group" aria-labelledby="join-watch-q"></div>
      </fieldset>
      <button class="primary join-setup-go" data-join-continue type="button" data-i18n="join"></button>
      <button class="ghost" data-setup-home type="button" data-i18n="leave"></button>
      ${creditFooter()}
    </section>
    <section class="screen join-screen" data-join-screen hidden>
      <div class="tv-top">
        ${brandBlock(true)}
        <div class="tv-meta">
          <div class="room-pill"><span data-i18n="roomWord"></span> <strong data-room></strong></div>
          <div class="status-pill"><span class="dot" data-dot></span><span data-status></span></div>
          ${uiLangSwitcherHtml(true)}
          <button class="ghost" data-home type="button" data-i18n="leave"></button>
        </div>
      </div>
      <p class="floor-banner" data-floor></p>
      <div class="join-main">
        <main class="tv-board" data-board></main>
      </div>
      <div class="join-dock">
        <p class="smart-view-tip" data-stt-hint></p>
        <label class="join-name">
          <span data-i18n="yourName"></span>
          <input data-name maxlength="24" autocomplete="name" data-i18n-placeholder="guestName" enterkeyhint="done" />
        </label>
        <div class="join-prefs">
          <div class="join-spoken">
            <p class="control-label" data-i18n="spokenLanguage"></p>
            <div class="chips" data-source></div>
          </div>
          <div class="join-watch">
            <p class="control-label" id="join-watch-label" data-i18n="watch"></p>
            <div class="chips" data-watch-box role="group" aria-labelledby="join-watch-label"></div>
          </div>
        </div>
        <div class="smart-view-controls join-actions">
          <button class="smart-view-mic" data-mic type="button" aria-pressed="false">
            ${micIcon}
            <small data-mic-label data-i18n="start"></small>
          </button>
        </div>
        <p class="hint" data-error></p>
        <form class="typed-caption join-type" data-type>
          <input name="caption" autocomplete="off" autocorrect="on" autocapitalize="sentences" enterkeyhint="send" />
          <button class="primary" type="submit" data-i18n="send"></button>
        </form>
        ${creditFooter()}
      </div>
    </section>
  `;

  const sourceBox = root.querySelector("[data-source]") as HTMLElement;
  sourceBox.innerHTML = LANGS.map(
    (lang) => `<button class="chip" type="button" data-lang="${lang}">${LANG_SHORT[lang]} ${LANG_LABEL[lang]}</button>`,
  ).join("");

  const watchBox = root.querySelector("[data-watch-box]") as HTMLElement;

  const typeForm = root.querySelector("[data-type]") as HTMLFormElement;
  const typeInput = typeForm.elements.namedItem("caption") as HTMLInputElement;
  const typeSend = typeForm.querySelector("button[type='submit']") as HTMLButtonElement;
  const screenEl = root.querySelector("[data-join-screen]") as HTMLElement;
  const setupEl = root.querySelector("[data-join-setup]") as HTMLElement;
  const setupSource = root.querySelector("[data-setup-source]") as HTMLElement;
  const setupWatch = root.querySelector("[data-setup-watch]") as HTMLElement;
  const setupName = root.querySelector("[data-setup-name]") as HTMLInputElement;
  const setupContinue = root.querySelector("[data-join-continue]") as HTMLButtonElement;
  const board = root.querySelector("[data-board]") as HTMLElement;
  const nameInput = root.querySelector("[data-name]") as HTMLInputElement;
  const sttHint = root.querySelector("[data-stt-hint]") as HTMLElement;
  const landscapeMq = window.matchMedia("(orientation: landscape)");
  nameInput.value = displayName === "Guest" ? displayRole("Guest") : displayName;
  setupName.value = displayName === "Guest" ? "" : displayName;
  setupSource.innerHTML = LANGS.map(
    (lang) =>
      `<button class="chip" type="button" data-setup-lang="${lang}" aria-pressed="false">${LANG_LABEL[lang]}</button>`,
  ).join("");

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
    if (stt.insecure) return t("sttHttps");
    if (!stt.canListen) return t("sttNeedsChrome");
    if (stt.preferType) return t("sttPreferType");
    return t("sttSameMeeting");
  }

  function renderDynamic() {
    const holding = isFloorHolder(floor, peerId);
    const blocked = floorHeldByOther(floor, peerId);
    const showMic = stt.canListen;
    els.room.textContent = state.room;
    const guestNote = peers.guests > 0 ? t("onPhones", { n: peers.guests }) : t("joined");
    const tvNote = peers.tvs > 0 ? t("tvConnectedSuffix", { n: peers.tvs }) : "";
    const connNote =
      connStatus === "live" ? `${guestNote}${tvNote}` : connStatus === "connecting" ? t("connecting") : t("reconnecting");
    els.status.textContent = holding && state.listening ? t("listeningDot", { note: connNote }) : connNote;
    els.dot.className = `dot ${holding && state.listening ? "listening" : connStatus === "live" ? "live" : "offline"}`;
    els.mic.hidden = !showMic;
    els.mic.classList.toggle("hot", holding && state.listening);
    els.mic.disabled = blocked;
    els.mic.setAttribute("aria-pressed", String(holding && state.listening));
    els.micLabel.textContent = holding ? t("stop") : blocked ? t("wait") : t("start");
    if (blocked) {
      els.floor.textContent = displayCopy(someoneElseSpeaking(floor));
    } else if (holding && state.listening) {
      els.floor.textContent = typeFallback ? t("floorYouType") : t("floorYouSpeaking");
    } else if (holding) {
      els.floor.textContent = t("floorYouHaveMic");
    } else if (!showMic) {
      els.floor.textContent = t("floorMicFreeType");
    } else {
      els.floor.textContent = t("floorMicFreeStart");
    }
    els.floor.hidden = false;
    sttHint.textContent = sttHintText();
    const extra = lastCaptionWasMock ? t("offlineLimited") : "";
    els.error.textContent = [displayCopy(error), extra].filter(Boolean).join(" ");
    typeForm.classList.toggle("is-primary", typeFallback || !showMic);
    typeInput.disabled = blocked;
    typeSend.disabled = blocked;
    typeInput.placeholder = blocked ? t("waitSomeonePlaceholder") : typeFallback || !showMic ? t("typeCaption") : t("orTypeCaption");
    for (const btn of sourceBox.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
      btn.classList.toggle("active", btn.dataset.lang === sourceLang);
    }
    for (const btn of watchBox.querySelectorAll<HTMLButtonElement>("[data-watch]")) {
      const on = btn.dataset.watch === watchLang;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    }
    paintCaptionBoard(
      board,
      { layout: state.layout, lines: finalizedLines(state.lines), listening: state.listening, floor },
      liveInterim && holding ? { text: liveInterim, sourceLang, speaker: guestSpeaker() } : null,
      langsForWatch(watchLang),
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
      void (async () => {
        await conn?.releaseFloor();
        renderDynamic();
        push();
      })();
      return;
    }
    if (floorHeldByOther(floor, peerId)) {
      error = someoneElseSpeaking(floor);
      renderDynamic();
      return;
    }
    // iOS Safari only runs SpeechRecognition.start() on the click stack.
    // An await (floor claim) before start() makes the mic a silent no-op.
    // Prime es-ES / pt-BR on the one iOS recognizer before that start().
    speech.setLang(speechLocale(sourceLang), true);
    speech.start();
    void (async () => {
      const ok = (await conn?.claimFloor(displayName)) ?? false;
      if (!ok) {
        speech.stop();
        pendingFinal = "";
        error = someoneElseSpeaking(floor);
        renderDynamic();
        return;
      }
      if (micFailed(error) && !isNonFatalSpeechNote(error)) {
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
      // Finals that arrived after start() but before the floor was granted.
      const queued = pendingFinal.trim();
      pendingFinal = "";
      if (queued) queuePublish(queued);
    })();
  };

  function guestSpeaker(): string {
    const typed = canonicalRole(nameInput.value, "Guest");
    return captionSpeakerName(typed, "Guest");
  }

  function currentGuestName(): string {
    const next = guestSpeaker();
    if (next !== displayName) {
      displayName = next;
      writeGuestName(displayName);
      nameInput.value = displayName === "Guest" ? displayRole("Guest") : displayName;
      if (isFloorHolder(floor, peerId)) void conn?.claimFloor(displayName);
    }
    return displayName;
  }

  async function publishFinal(text: string, coalesce = true) {
    const spoken = text.trim();
    if (!spoken) return;
    const speaker = currentGuestName();
    if (floorHeldByOther(floor, peerId)) {
      error = someoneElseSpeaking(floor);
      renderDynamic();
      return;
    }
    if (!isFloorHolder(floor, peerId)) {
      const ok = (await conn?.claimFloor(speaker)) ?? false;
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
      speaker,
      at: Date.now(),
    };
    const lines = coalesce
      ? applyFinalLine(state.lines, line, from)
      : appendFinalLine(state.lines, line);
    state = { ...state, lines, sourceLang, floor, listening: true };
    renderDynamic();
    push();
  }

  let publishQueue: Promise<void> = Promise.resolve();
  const queuePublish = (text: string, coalesce = true) => {
    publishQueue = publishQueue.then(() => publishFinal(text, coalesce)).catch(() => undefined);
  };

  // Interims paint on this phone only. Peers receive one committed line.
  // iPhone Safari often never sets isFinal, and can end a heard phrase with
  // no-speech. The speech provider turns that into one final so this still pushes.
  speech.onResult = (result) => {
    error = "";
    if (result.isFinal) {
      if (isFloorHolder(floor, peerId)) {
        pendingFinal = "";
        queuePublish(result.text);
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
    // no-speech is a pause or a WebKit miss. Keep the mic up and show the note.
    // Do not drop a final that already arrived before the floor claim resolved.
    if (isNonFatalSpeechNote(message)) {
      renderDynamic();
      return;
    }
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
    writeSpokenLang(sourceLang);
    speech.setLang(speechLocale(sourceLang), true);
    if (isFloorHolder(floor, peerId)) {
      state = { ...state, sourceLang };
      push();
    }
    renderDynamic();
  };

  const onWatch = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-watch]");
    if (!btn?.dataset.watch || !isWatchLang(btn.dataset.watch) || btn.dataset.watch === watchLang) return;
    watchLang = btn.dataset.watch;
    writeWatchLang(watchLang);
    renderDynamic();
  };

  const onName = () => {
    displayName = sanitizePeerName(canonicalRole(nameInput.value, "Guest"), "Guest");
    writeGuestName(displayName);
    nameInput.value = displayName === "Guest" ? displayRole("Guest") : displayName;
    if (isFloorHolder(floor, peerId)) void conn?.claimFloor(displayName);
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
      const speaker = currentGuestName();
      if (floorHeldByOther(floor, peerId)) {
        error = someoneElseSpeaking(floor);
        renderDynamic();
        return;
      }
      if (!isFloorHolder(floor, peerId)) {
        const ok = (await conn?.claimFloor(speaker)) ?? false;
        if (!ok) {
          error = someoneElseSpeaking(floor);
          renderDynamic();
          return;
        }
        state = { ...state, listening: true, sourceLang, floor };
        push();
      }
      typeInput.value = "";
      queuePublish(text, false);
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

  const paintWatch = () => {
    watchBox.innerHTML = watchChipsHtml("data-watch");
    setupWatch.innerHTML = watchChipsHtml("data-setup-watch-lang");
  };

  const paintSetup = () => {
    for (const btn of setupSource.querySelectorAll<HTMLButtonElement>("[data-setup-lang]")) {
      const on = btn.dataset.setupLang === sourceLang;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    }
    for (const btn of setupWatch.querySelectorAll<HTMLButtonElement>("[data-setup-watch-lang]")) {
      const on = btn.dataset.setupWatchLang === watchLang;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    }
  };

  const onUiLang = () => {
    paintWatch();
    if (isDefaultRole(nameInput.value)) nameInput.value = displayRole("Guest");
    if (entered) renderDynamic();
    paintSetup();
  };

  const onSetupSource = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-setup-lang]");
    if (!btn?.dataset.setupLang || !isLang(btn.dataset.setupLang)) return;
    sourceLang = btn.dataset.setupLang;
    writeSpokenLang(sourceLang);
    speech.setLang(speechLocale(sourceLang), true);
    paintSetup();
  };

  const onSetupWatch = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-setup-watch-lang]");
    if (!btn?.dataset.setupWatchLang || !isWatchLang(btn.dataset.setupWatchLang)) return;
    watchLang = btn.dataset.setupWatchLang;
    writeWatchLang(watchLang);
    paintSetup();
  };

  const onSetupName = () => {
    displayName = sanitizePeerName(canonicalRole(setupName.value, "Guest"), "Guest");
    writeGuestName(displayName);
  };

  const onSetupHome = () => {
    goto("home");
  };

  const enterRoom = () => {
    if (entered) return;
    onSetupName();
    writeSpokenLang(sourceLang);
    writeWatchLang(watchLang);
    speech.setLang(speechLocale(sourceLang), true);
    nameInput.value = displayName === "Guest" ? displayRole("Guest") : displayName;
    entered = true;
    setupEl.hidden = true;
    screenEl.hidden = false;
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
  };

  els.mic.addEventListener("click", onMic);
  document.addEventListener("visibilitychange", onVisibility);
  sourceBox.addEventListener("click", onSource);
  watchBox.addEventListener("click", onWatch);
  nameInput.addEventListener("change", onName);
  root.querySelector("[data-home]")?.addEventListener("click", onHome);
  typeForm.addEventListener("submit", onType);
  setupSource.addEventListener("click", onSetupSource);
  setupWatch.addEventListener("click", onSetupWatch);
  setupName.addEventListener("change", onSetupName);
  setupContinue.addEventListener("click", enterRoom);
  root.querySelector("[data-setup-home]")?.addEventListener("click", onSetupHome);
  const unbindLang = bindUiLang(root, onUiLang);
  paintWatch();
  paintSetup();

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
    watchBox.removeEventListener("click", onWatch);
    nameInput.removeEventListener("change", onName);
    typeForm.removeEventListener("submit", onType);
    setupSource.removeEventListener("click", onSetupSource);
    setupWatch.removeEventListener("click", onSetupWatch);
    setupName.removeEventListener("change", onSetupName);
    setupContinue.removeEventListener("click", enterRoom);
    unbindLang();
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

function readWatchLang(): WatchLang {
  try {
    const value = localStorage.getItem(WATCH_KEY);
    return isWatchLang(value) ? value : "all";
  } catch {
    return "all";
  }
}

function writeWatchLang(value: WatchLang) {
  try {
    localStorage.setItem(WATCH_KEY, value);
  } catch {
    /* private mode / blocked storage */
  }
}

function readSpokenLang(): Lang {
  try {
    const value = localStorage.getItem(SPOKEN_KEY);
    return isLang(value) ? value : "en";
  } catch {
    return "en";
  }
}

function writeSpokenLang(value: Lang) {
  try {
    localStorage.setItem(SPOKEN_KEY, value);
  } catch {
    /* private mode / blocked storage */
  }
}
