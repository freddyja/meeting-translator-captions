import { brandBlock, creditFooter } from "../brand";
import {
  appendFinalLine,
  applyFinalLine,
  finalizedLines,
  provisionalLine,
  revisionOfLast,
  settleProvisional,
} from "../caption-history";
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
import { mountMoreMenu } from "../input/more-menu";
import { swapGuestLangs } from "../lang-swap";
import { connectRoom, type RoomConnection } from "../realtime/client";
import { goto } from "../router";
import { detectSpeechCapability } from "../stt/capability";
import { createWebSpeechProvider, isNonFatalSpeechNote } from "../stt/web-speech";
import { speechSourceLang } from "../speech-caption";
import { readSpokenLang, writeSpokenLang } from "../spoken-pref";
import { createTranslator, detectLang, translateAll } from "../translate";
import { subscribeTranslateStatus, translateStatus } from "../translate/request";
import { spokenKey } from "../translate/panes";
import { paintCaptionBoard } from "./caption-board";
import {
  emptyFloor,
  emptyState,
  floorBusyCopy,
  floorHeldByOther,
  isFloorHolder,
  isFloorNotice,
  RECONNECTING,
  isLang,
  keepsLocalCaptions,
  lostFloor,
  reconcileFloor,
  LANG_LABEL,
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
import { trackSpeech } from "../update/activity";
import { micUi, shouldReleaseTypedFloor } from "../mic-ui";
import { confirmLeave } from "./confirm";
import { markMeetingUsed, openTour } from "./onboarding-ui";


const NAME_KEY = "mt-guest-name";
const WATCH_KEY = "mt-guest-watch";

export function mountJoin(root: HTMLElement, room: string): () => void {
  const translator = createTranslator();
  const speech = trackSpeech(createWebSpeechProvider());
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
  let liveDraftLang: Lang = sourceLang;
  let watchLang: WatchLang = readWatchLang();
  let displayName = readGuestName();
  let entered = false;
  let lastCaptionWasMock = false;
  let typeFallback = stt.preferType;
  let pendingSpeech: { text: string; lang: Lang } | null = null;
  /** Set by a fatal speech error; checked after an in-flight floor claim. */
  let speechFailed = false;
  /** Live mic session on this phone (not a Type + Send claim). */
  let micActive = false;
  /** Captions queued or translating. */
  let publishing = 0;

  const push = () =>
    conn?.push({
      ...state,
      sourceLang,
      floor,
      listening: state.listening,
    });

  root.innerHTML = `
    <section class="screen join-setup entry-scene scene-bg" data-join-setup>
      <div class="setup-top">
        <button class="secondary setup-leave" data-setup-home type="button" data-i18n="leaveSetup"></button>
      </div>
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
      ${creditFooter()}
    </section>
    <section class="screen join-screen ux-guest" data-join-screen hidden>
      <div class="tv-top">
        ${brandBlock(true)}
        <div class="tv-meta">
          <div class="room-pill"><span data-i18n="roomWord"></span> <strong data-room></strong></div>
          <div class="status-pill"><span class="dot" data-dot></span><span data-status></span></div>
          <button class="secondary help-btn" data-help type="button" data-i18n="helpBtn" data-i18n-aria="helpAria"></button>
          <button class="secondary leave-btn" data-home type="button" data-i18n="leave"></button>
        </div>
      </div>
      <p class="floor-banner" data-floor role="status" aria-live="polite"></p>
      <div class="join-actions">
        <button class="mic mic-big" data-mic type="button" aria-pressed="false">
          <span class="mic-big-label" data-mic-label></span>
        </button>
      </div>
      <div class="join-main">
        <main class="tv-board" data-board></main>
      </div>
      <div class="join-dock">
        <div class="join-prefs-bar">
          <span class="join-prefs-summary" data-prefs-summary></span>
          <button class="secondary join-prefs-toggle" data-prefs-toggle type="button" aria-expanded="false" aria-controls="join-prefs-panel" data-i18n="changePrefs" data-i18n-aria="changePrefsAria"></button>
        </div>
        <div class="join-prefs-panel" id="join-prefs-panel" data-prefs-panel hidden>
          ${uiLangSwitcherHtml("entry")}
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
              <p class="control-label lang-label-row"><span id="join-watch-label" data-i18n="watch"></span><button class="swap-icon" data-swap type="button" data-i18n-aria="swapAria"><span aria-hidden="true">⇄</span></button></p>
              <div class="chips" data-watch-box role="group" aria-labelledby="join-watch-label"></div>
            </div>
          </div>
        </div>
        <p class="smart-view-tip" data-stt-hint></p>
        <p class="hint" data-error></p>
        <form class="typed-caption join-type" data-type>
          <input name="caption" autocomplete="off" autocorrect="on" autocapitalize="sentences" enterkeyhint="send" />
          <button class="primary" type="submit" data-i18n="send"></button>
        </form>
        <div class="more-bar" data-more-bar></div>
        ${creditFooter()}
      </div>
    </section>
  `;

  const sourceBox = root.querySelector("[data-source]") as HTMLElement;
  sourceBox.innerHTML = LANGS.map(
    (lang) => `<button class="chip" type="button" data-lang="${lang}">${LANG_LABEL[lang]}</button>`,
  ).join("");

  const watchBox = root.querySelector("[data-watch-box]") as HTMLElement;
  const swapBtn = root.querySelector("[data-swap]") as HTMLButtonElement;

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
  const prefsToggle = root.querySelector("[data-prefs-toggle]") as HTMLButtonElement;
  const prefsPanel = root.querySelector("[data-prefs-panel]") as HTMLElement;
  const prefsSummary = root.querySelector("[data-prefs-summary]") as HTMLElement;
  const helpBtn = root.querySelector("[data-help]") as HTMLButtonElement;
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
    // The floor banner already says "one person at a time"; no extra line needed.
    return "";
  }

  function renderDynamic() {
    const holding = isFloorHolder(floor, peerId);
    const live = connStatus === "live";
    const heldByOther = floorHeldByOther(floor, peerId);
    // Offline, the floor snapshot is stale: say Reconnecting, not "someone else".
    const blocked = live && heldByOther;
    const downNote = connStatus === "waking" ? t("wakingServer") : t("reconnecting");
    const showMic = stt.canListen;
    els.room.textContent = state.room;
    const guestNote = peers.guests > 0 ? t("onPhones", { n: peers.guests }) : t("joined");
    const tvNote = peers.tvs > 0 ? t("tvConnectedSuffix", { n: peers.tvs }) : "";
    const connNote =
      live ? `${guestNote}${tvNote}` : connStatus === "connecting" ? t("connecting") : downNote;
    // Only a live mic session counts as listening. Type + Send also holds the
    // floor (state.listening is true on the wire while it posts), but must never
    // light the mic, flip it to Stop, or say "You're speaking".
    const mic = micUi({ holding, micLive: micActive, blocked });
    els.status.textContent = mic.listening ? t("listeningDot", { note: connNote }) : connNote;
    els.dot.className = `dot ${mic.listening ? "listening" : connStatus === "live" ? "live" : "offline"}`;
    els.mic.hidden = !showMic;
    els.mic.classList.toggle("hot", mic.hot);
    els.mic.disabled = blocked;
    els.mic.setAttribute("aria-pressed", String(mic.hot));
    els.micLabel.textContent = mic.label === "stop" ? t("micTapToStop") : mic.label === "wait" ? t("micWaitTurn") : t("micTapToTalk");
    let floorState = "free";
    if (heldByOther && !live) {
      els.floor.textContent = downNote;
      floorState = "down";
    } else if (blocked) {
      els.floor.textContent = displayCopy(someoneElseSpeaking(floor));
      floorState = "busy";
    } else if (mic.listening) {
      els.floor.textContent = typeFallback ? t("floorYouType") : t("floorYouSpeaking");
      floorState = "you";
    } else if (!showMic) {
      els.floor.textContent = t("floorMicFreeType");
    } else {
      els.floor.textContent = t("floorMicFreeStart");
    }
    els.floor.dataset.state = floorState;
    els.floor.hidden = false;
    prefsSummary.textContent = t("prefsSummary", {
      name: displayName === "Guest" ? displayRole("Guest") : displayName,
      spoken: LANG_LABEL[sourceLang],
    });
    sttHint.textContent = sttHintText();
    const extra = lastCaptionWasMock ? t("offlineLimited") : "";
    const translateNote = translateStatus() === "waking" ? t("translateWaking") : "";
    els.error.textContent = [displayCopy(error), translateNote, extra].filter(Boolean).join(" ");
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
    const canSwap = Boolean(swapGuestLangs(sourceLang, watchLang));
    swapBtn.disabled = !canSwap;
    swapBtn.title = canSwap ? t("swapAria") : t("swapNeedsOne");
    paintCaptionBoard(
      board,
      { layout: state.layout, lines: finalizedLines(state.lines), listening: state.listening, floor },
      liveInterim && holding
        ? { text: liveInterim, sourceLang, draftLang: liveDraftLang, speaker: guestSpeaker() }
        : null,
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
    micActive = false;
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
      pendingSpeech = null;
      void (async () => {
        await conn?.releaseFloor();
        renderDynamic();
        push();
      })();
      return;
    }
    if (floorHeldByOther(floor, peerId)) {
      error = floorBusyCopy(connStatus, floor);
      renderDynamic();
      return;
    }
    // iOS Safari only runs SpeechRecognition.start() on the click stack.
    // An await (floor claim) before start() makes the mic a silent no-op.
    // Prime es-ES / pt-BR on the one iOS recognizer before that start().
    speechFailed = false;
    speech.setLang(speechLocale(sourceLang), true);
    speech.start();
    void (async () => {
      const ok = (await conn?.claimFloor(displayName)) ?? false;
      if (!ok) {
        speech.stop();
        pendingSpeech = null;
        error = floorBusyCopy(connStatus, floor);
        renderDynamic();
        return;
      }
      if (speechFailed) {
        // The mic died while the claim was in flight. Give the floor back;
        // Type + Send claims it again on send.
        stopLocalMic();
        typeFallback = true;
        typeInput.focus();
        void conn?.releaseFloor();
        state = { ...state, listening: false, sourceLang, floor };
        renderDynamic();
        return;
      }
      void requestWake();
      micActive = true;
      state = { ...state, listening: true, sourceLang, floor };
      renderDynamic();
      push();
      // Finals that arrived after start() but before the floor was granted.
      const queued = pendingSpeech;
      pendingSpeech = null;
      if (queued?.text.trim()) queuePublish(queued.text, true, queued.lang);
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

  async function publishFinal(text: string, coalesce = true, speechLang?: Lang) {
    const spoken = text.trim();
    if (!spoken) return;
    const speaker = currentGuestName();
    if (floorHeldByOther(floor, peerId)) {
      error = floorBusyCopy(connStatus, floor);
      renderDynamic();
      return;
    }
    if (!isFloorHolder(floor, peerId)) {
      const ok = (await conn?.claimFloor(speaker)) ?? false;
      if (!ok || !isFloorHolder(floor, peerId)) {
        error = floorBusyCopy(connStatus, floor);
        renderDynamic();
        return;
      }
      state = { ...state, listening: true, sourceLang, floor };
      push();
    }
    error = "";
    liveInterim = "";
    const epoch = publishEpoch;
    const hint = speechLang ?? sourceLang;
    const paneLang = detectLang(spoken, hint);
    const last = finalizedLines(state.lines).at(-1);
    // Unchanged words (a repeated final): nothing to show, nothing to translate.
    if (coalesce && revisionOfLast(last?.text[paneLang], spoken) === "duplicate") {
      renderDynamic();
      return;
    }
    // Show the original at once on every screen; translations fill in after.
    const provisional = provisionalLine(spoken, paneLang, speaker, coalesce ? last : undefined);
    const shown = coalesce
      ? applyFinalLine(state.lines, provisional, paneLang)
      : appendFinalLine(state.lines, provisional);
    const lineId = shown.at(-1)?.id ?? provisional.id;
    state = { ...state, lines: shown, sourceLang, floor, listening: true };
    renderDynamic();
    push();
    const translated = await translateAll(translator, spoken, hint);
    const from = spokenKey(spoken, translated, hint);
    if (epoch !== publishEpoch) return;
    lastCaptionWasMock = translator.id === "mock";
    const line: CaptionLine = {
      id: lineId,
      isFinal: true,
      text: translated,
      speaker,
      at: provisional.at,
    };
    const lines = settleProvisional(state.lines, line, from, coalesce);
    state = { ...state, lines, sourceLang, floor, listening: true };
    renderDynamic();
    push();
  }

  let publishQueue: Promise<void> = Promise.resolve();
  const queuePublish = (text: string, coalesce = true, speechLang?: Lang) => {
    publishing += 1;
    publishQueue = publishQueue
      .then(() => publishFinal(text, coalesce, speechLang))
      .catch(() => undefined)
      .finally(() => {
        publishing -= 1;
        releaseTypedFloor();
      });
  };

  /** A typed message is posted: give the speaking turn back so others can talk. */
  const releaseTypedFloor = () => {
    if (!shouldReleaseTypedFloor({ holding: isFloorHolder(floor, peerId), micLive: micActive, publishing })) return;
    void (async () => {
      await conn?.releaseFloor();
      if (micActive) return;
      state = { ...state, listening: false, floor };
      renderDynamic();
    })();
  };

  // Interims paint on this phone only. Peers receive one committed line.
  // iPhone Safari often never sets isFinal, and can end a heard phrase with
  // no-speech. The speech provider turns that into one final so this still pushes.
  speech.onResult = (result) => {
    error = "";
    const heard = speechSourceLang(result.text, sourceLang, result.locale);
    if (result.isFinal) {
      if (isFloorHolder(floor, peerId)) {
        pendingSpeech = null;
        queuePublish(result.text, true, heard);
      } else if (!floorHeldByOther(floor, peerId)) {
        pendingSpeech = { text: result.text, lang: heard };
      } else {
        error = floorBusyCopy(connStatus, floor);
        renderDynamic();
      }
      return;
    }
    if (!isFloorHolder(floor, peerId)) return;
    const next = result.text.trim();
    if (next === liveInterim && (!next || heard === liveDraftLang)) return;
    liveInterim = next;
    if (next) liveDraftLang = heard;
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
    // Fatal: recognition is over. Release the floor so others can speak;
    // Type + Send claims it again when this guest sends.
    speechFailed = true;
    pendingSpeech = null;
    const held = isFloorHolder(floor, peerId);
    stopLocalMic();
    if (held) void conn?.releaseFloor();
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

  const onSwap = () => {
    const next = swapGuestLangs(sourceLang, watchLang);
    if (!next) return;
    sourceLang = next.spoken;
    watchLang = next.watch;
    liveInterim = "";
    writeSpokenLang(sourceLang);
    writeWatchLang(watchLang);
    // Same tap as a Spoken chip: iOS reuses the first recognizer and only changes lang.
    speech.setLang(speechLocale(sourceLang), true);
    if (isFloorHolder(floor, peerId)) {
      state = { ...state, sourceLang };
      push();
    }
    renderDynamic();
  };

  const onName = () => {
    displayName = sanitizePeerName(canonicalRole(nameInput.value, "Guest"), "Guest");
    writeGuestName(displayName);
    nameInput.value = displayName === "Guest" ? displayRole("Guest") : displayName;
    if (isFloorHolder(floor, peerId)) void conn?.claimFloor(displayName);
    renderDynamic();
  };

  const onHome = () => {
    void confirmLeave(screenEl, "leave").then((ok) => {
      if (!ok) return;
      speech.stop();
      releaseWake();
      void conn?.releaseFloor();
      goto("home");
    });
  };

  const onPrefsToggle = () => {
    const open = prefsPanel.hidden;
    prefsPanel.hidden = !open;
    prefsToggle.setAttribute("aria-expanded", String(open));
    prefsToggle.classList.toggle("active", open);
  };

  let closeTour: (() => void) | null = null;
  const onHelp = () => {
    if (closeTour) return;
    closeTour = openTour(screenEl, () => {
      closeTour = null;
    });
  };

  /** One-shot language from ⋯ More → Photo; cleared so the next typed caption uses Spoken. */
  const takeLangHint = (): Lang | undefined => {
    const hint = typeForm.dataset.langHint;
    delete typeForm.dataset.langHint;
    return isLang(hint) ? hint : undefined;
  };

  const onType = (event: Event) => {
    event.preventDefault();
    const langHint = takeLangHint();
    void (async () => {
      const text = typeInput.value.trim();
      if (!text) return;
      const speaker = currentGuestName();
      if (floorHeldByOther(floor, peerId)) {
        error = floorBusyCopy(connStatus, floor);
        renderDynamic();
        return;
      }
      if (!isFloorHolder(floor, peerId)) {
        const ok = (await conn?.claimFloor(speaker)) ?? false;
        if (!ok) {
          error = floorBusyCopy(connStatus, floor);
          renderDynamic();
          return;
        }
        state = { ...state, listening: true, sourceLang, floor };
        push();
      }
      typeInput.value = "";
      queuePublish(text, false, langHint);
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
      // A guest keeps the floor across a reconnect only while actually sending
      // (live mic or a caption in flight). An idle Type + Send claim is released.
      keepFloorOnReconnect: () => micActive || publishing > 0,
      onJoined(info) {
        peerId = info.peerId;
        markMeetingUsed();
        const next = info.floor ?? floor;
        // Reconnected after someone else took the floor while we were away.
        if (state.listening && floorHeldByOther(next, info.peerId)) {
          publishEpoch += 1;
          pendingSpeech = null;
          floor = next;
          stopLocalMic();
          error = someoneElseSpeaking(next);
        } else {
          floor = next;
          // Came back without the floor (idle Type + Send claim was released).
          if (state.listening && !micActive && !isFloorHolder(next, info.peerId)) {
            state = { ...state, listening: false, floor };
          }
        }
        renderDynamic();
      },
      onFloor(next) {
        const lost = lostFloor(floor, next, peerId);
        floor = next;
        if (lost) {
          publishEpoch += 1;
          pendingSpeech = null;
          stopLocalMic();
          error = someoneElseSpeaking(next);
        } else if (isFloorHolder(next, peerId) && isFloorNotice(error)) {
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
          sourceLang,
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
        if (status === "live" && error === RECONNECTING) error = "";
        renderDynamic();
      },
    });
    renderDynamic();
  };

  els.mic.addEventListener("click", onMic);
  document.addEventListener("visibilitychange", onVisibility);
  sourceBox.addEventListener("click", onSource);
  watchBox.addEventListener("click", onWatch);
  swapBtn.addEventListener("click", onSwap);
  const unmountMore = mountMoreMenu({
    bar: root.querySelector("[data-more-bar]") as HTMLElement,
    dialogHost: screenEl,
    form: typeForm,
    input: typeInput,
    lang: () => sourceLang,
    translate: (text, from) => translateAll(translator, text, from),
  });
  nameInput.addEventListener("change", onName);
  root.querySelector("[data-home]")?.addEventListener("click", onHome);
  prefsToggle.addEventListener("click", onPrefsToggle);
  helpBtn.addEventListener("click", onHelp);
  typeForm.addEventListener("submit", onType);
  setupSource.addEventListener("click", onSetupSource);
  setupWatch.addEventListener("click", onSetupWatch);
  setupName.addEventListener("change", onSetupName);
  setupContinue.addEventListener("click", enterRoom);
  root.querySelector("[data-setup-home]")?.addEventListener("click", onSetupHome);
  const unbindLang = bindUiLang(root, onUiLang);
  paintWatch();
  paintSetup();

  const unsubTranslate = subscribeTranslateStatus(() => {
    if (entered) renderDynamic();
  });

  return () => {
    speech.stop();
    releaseWake();
    conn?.close();
    unsubTranslate();
    landscapeMq.removeEventListener("change", onOrientationChange);
    window.removeEventListener("resize", onOrientationChange);
    window.removeEventListener("orientationchange", onOrientationChange);
    document.removeEventListener("visibilitychange", onVisibility);
    els.mic.removeEventListener("click", onMic);
    sourceBox.removeEventListener("click", onSource);
    watchBox.removeEventListener("click", onWatch);
    swapBtn.removeEventListener("click", onSwap);
    unmountMore();
    nameInput.removeEventListener("change", onName);
    prefsToggle.removeEventListener("click", onPrefsToggle);
    helpBtn.removeEventListener("click", onHelp);
    closeTour?.();
    typeForm.removeEventListener("submit", onType);
    setupSource.removeEventListener("click", onSetupSource);
    setupWatch.removeEventListener("click", onSetupWatch);
    setupName.removeEventListener("change", onSetupName);
    setupContinue.removeEventListener("click", enterRoom);
    unbindLang();
  };
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
