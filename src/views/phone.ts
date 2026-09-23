import { brandBlock, creditFooter } from "../brand";
import { appendFinalLine, applyFinalLine, finalizedLines, previewCaption } from "../caption-history";
import { escapeHtml } from "../dom";
import { bindUiLang, displayCopy, t, uiLangSwitcherHtml } from "../i18n";
import { bindLocalSetup, localSetupInnerHtml } from "../local-setup";
import { bindOfflineModeToggle, isOfflineMeeting } from "../offline-mode";
import { tvQrSvg } from "../qr";
import { connectRoom, type RoomConnection } from "../realtime/client";
import { goto, joinUrl, tvUrl } from "../router";
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
  LAYOUTS,
  captionSpeakerName,
  someoneElseSpeaking,
  speechLocale,
  type CaptionLine,
  type ConnStatus,
  type FloorState,
  type Lang,
  type Layout,
  type PeerCounts,
  type RoomState,
} from "../types";

const HOST_NAME = "Host";

const micIcon = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
  <rect x="9" y="3" width="6" height="11" rx="3"/>
  <path d="M6 11a6 6 0 0 0 12 0"/>
  <path d="M12 17v4M8 21h8"/>
</svg>
`;

export function mountPhone(root: HTMLElement, room: string): () => void {
  const translator = createTranslator();
  const speech = createWebSpeechProvider();
  let state = emptyState(room);
  let peers: PeerCounts = { phones: 1, tvs: 0, guests: 0 };
  let connStatus: ConnStatus = "connecting";
  let error = "";
  let conn: RoomConnection | null = null;
  let publishEpoch = 0;
  let hydrated = false;
  let wakeLock: WakeLockSentinel | null = null;
  let copyLabelTimer = 0;
  const copyLangTimers: Partial<Record<Lang, number>> = {};
  let copyJoinTimer = 0;
  let smartViewMode = false;
  let liveInterim = "";
  let lastCaptionWasMock = false;
  let sourceTouched = false;
  let pendingFinal = "";
  let peerId: string | null = null;
  let floor: FloorState = emptyFloor();

  const push = () => conn?.push(state);

  const setState = (next: RoomState, sync = true) => {
    state = { ...next, floor };
    renderDynamic();
    if (sync) push();
  };

  root.innerHTML = `
    <section class="screen phone-screen">
      <div class="phone-top">
        ${brandBlock()}
        <div class="phone-status">
          <div class="room-pill"><span data-i18n="roomWord"></span> <strong data-room></strong></div>
          <div class="status-pill"><span class="dot" data-dot></span><span data-status></span></div>
        </div>
      </div>

      <div class="phone-body">
        <div class="phone-main">
          <div class="preview phone-caption-preview">
            <p class="control-label" data-i18n="onThisPhone"></p>
            <p data-preview></p>
          </div>
          <div class="tv-board phone-live-board" data-phone-board></div>
        </div>

        <div class="phone-side">
          <div class="mic-wrap">
            <button class="mic" data-mic type="button" aria-pressed="false">
              ${micIcon}
              <small data-mic-label data-i18n="start"></small>
            </button>
            <p class="hint" data-error></p>
            <p class="floor-banner" data-floor></p>
            <button class="secondary floor-reclaim" data-reclaim type="button" hidden data-i18n="reclaimMic"></button>
            <p class="hint mic-chrome-hint" data-i18n="micChromeHint"></p>
          </div>

          <div class="controls">
            ${uiLangSwitcherHtml()}
            <div class="meeting-mode">
              <p class="control-label" data-i18n="meetingMode"></p>
              <button class="chip" data-offline-mode type="button" aria-pressed="false" data-i18n="offlineLocal" data-i18n-aria="offlineAria"></button>
              <p class="offline-banner" data-offline-banner hidden>
                <span data-i18n="offlineBannerBefore"></span><button class="ghost setup-link" data-local-setup-open type="button" aria-haspopup="dialog" aria-controls="local-setup-dialog" data-i18n="laptopSteps"></button><span data-i18n="offlineBannerAfter"></span>
              </p>
            </div>
            <div>
              <p class="control-label" data-i18n="spokenLanguage"></p>
              <div class="chips" data-source></div>
            </div>
            <div>
              <p class="control-label" data-i18n="tvLayout"></p>
              <div class="chips" data-layouts></div>
            </div>
            <div class="row-actions tv-path-actions">
              <button class="primary send-tv-btn" data-send-tv type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="send-tv-dialog" data-i18n="sendToTv" data-i18n-aria="sendToTvAria"></button>
              <button class="secondary smart-view-btn" data-smart-view-mode type="button" aria-pressed="false" data-i18n="smartViewMode" data-i18n-aria="smartViewAria"></button>
              <button class="secondary join-phones-btn" data-join-phones type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="join-phones-dialog" data-i18n="joinOnPhones" data-i18n-aria="joinPhonesAria"></button>
            </div>
            <div class="row-actions">
              <button class="ghost" data-clear type="button" data-i18n="clearWindows"></button>
              <button class="ghost" data-home type="button" data-i18n="leave"></button>
            </div>
            <form class="typed-caption" data-type>
              <input name="caption" autocomplete="off" enterkeyhint="send" data-i18n-placeholder="orTypeCaption" />
              <button class="primary" type="submit" data-i18n="send"></button>
            </form>
          </div>
        </div>
      </div>

      ${creditFooter()}

      <dialog class="send-tv-dialog" id="send-tv-dialog" data-send-tv-dialog aria-labelledby="send-tv-title">
        <div class="send-tv-sheet">
          <header class="send-tv-head">
            <h2 id="send-tv-title" data-i18n="sendToTv"></h2>
            <button class="ghost send-tv-close" data-send-tv-close type="button" data-i18n="close"></button>
          </header>
          <div class="send-tv-qr" data-send-tv-qr></div>
          <p class="send-tv-url" data-send-tv-url></p>
          <button class="primary send-tv-copy" data-copy type="button" data-i18n="copyTvLink"></button>
          <ol class="send-tv-steps">
            <li data-i18n="sendTvStep1"></li>
            <li data-i18n="sendTvStep2"></li>
            <li data-i18n="sendTvStep3"></li>
          </ol>
          <button class="ghost send-tv-open" data-open-tv type="button" data-i18n="openTvView" data-i18n-aria="openTvAria"></button>
          <section class="send-tv-langs" data-send-tv-langs>
            <h3 data-i18n="oneLanguagePerMonitor"></h3>
            <p class="hint" data-i18n="perMonitorHint"></p>
            <div class="send-tv-lang-list" data-send-tv-lang-list></div>
          </section>
        </div>
      </dialog>

      <dialog class="send-tv-dialog" id="join-phones-dialog" data-join-phones-dialog aria-labelledby="join-phones-title">
        <div class="send-tv-sheet">
          <header class="send-tv-head">
            <h2 id="join-phones-title" data-i18n="joinOnPhones"></h2>
            <button class="ghost send-tv-close" data-join-phones-close type="button" data-i18n="close"></button>
          </header>
          <p class="hint" data-i18n="scanToWatch"></p>
          <div class="send-tv-qr" data-join-phones-qr></div>
          <p class="send-tv-url" data-join-phones-url></p>
          <button class="primary send-tv-copy" data-copy-join type="button" data-i18n="copyJoinLink"></button>
          <ol class="send-tv-steps">
            <li data-i18n="joinStep1"></li>
            <li data-i18n="joinStep2"></li>
            <li data-i18n="joinStep3"></li>
          </ol>
        </div>
      </dialog>

      <dialog class="setup-dialog" id="local-setup-dialog" data-local-setup-dialog aria-labelledby="local-setup-title">
        <div class="send-tv-sheet">
          <header class="send-tv-head">
            <h2 id="local-setup-title" data-i18n="localTitle"></h2>
            <button class="ghost send-tv-close" data-local-setup-close type="button" data-i18n="close"></button>
          </header>
          <div data-local-setup>
            ${localSetupInnerHtml({ heading: false })}
          </div>
        </div>
      </dialog>

      <div class="smart-view-layer" data-smart-view-layer hidden>
        <section class="screen tv-screen smart-view-captions">
          <div class="tv-top">
            ${brandBlock(true)}
            <div class="tv-meta">
              <div class="room-pill"><span data-i18n="roomWord"></span> <strong data-sv-room></strong></div>
              <div class="status-pill"><span class="dot" data-sv-dot></span><span data-sv-status></span></div>
              ${uiLangSwitcherHtml(true)}
            </div>
          </div>
          <main class="tv-board" data-sv-board></main>
          <div class="smart-view-dock">
            <p class="smart-view-tip" data-i18n="smartViewTip"></p>
            <div class="smart-view-controls">
              <div class="smart-view-source" role="group" data-i18n-aria="spokenLanguage">
                <span class="smart-view-source-label" data-i18n="spokenShort"></span>
                <div class="chips smart-view-source-chips" data-smart-source></div>
              </div>
              <button class="smart-view-mic" data-smart-mic type="button" aria-pressed="false">
                ${micIcon}
                <small data-smart-mic-label data-i18n="start"></small>
              </button>
              <button class="secondary" data-exit-smart-view type="button" data-i18n="exitSmartView"></button>
            </div>
            ${creditFooter()}
          </div>
        </section>
      </div>
    </section>
  `;

  const sourceBox = root.querySelector("[data-source]") as HTMLElement;
  const smartSourceBox = root.querySelector("[data-smart-source]") as HTMLElement;
  const layoutBox = root.querySelector("[data-layouts]") as HTMLElement;
  sourceBox.innerHTML = LANGS.map(
    (lang) => `<button class="chip" type="button" data-lang="${lang}">${LANG_SHORT[lang]} ${LANG_LABEL[lang]}</button>`,
  ).join("");
  smartSourceBox.innerHTML = LANGS.map(
    (lang) =>
      `<button class="chip smart-view-source-chip" type="button" data-lang="${lang}" aria-label="Spoken language: ${LANG_LABEL[lang]}" aria-pressed="false">${LANG_SHORT[lang]}</button>`,
  ).join("");
  layoutBox.innerHTML = LAYOUTS.map(
    (item) => `<button class="chip" type="button" data-layout="${item.id}">${item.label}</button>`,
  ).join("");

  const typeForm = root.querySelector("[data-type]") as HTMLFormElement;
  const sendBtn = root.querySelector("[data-send-tv]") as HTMLButtonElement;
  const sendDialog = root.querySelector("[data-send-tv-dialog]") as HTMLDialogElement;
  const qrBox = root.querySelector("[data-send-tv-qr]") as HTMLElement;
  const urlEl = root.querySelector("[data-send-tv-url]") as HTMLElement;
  const copyBtn = root.querySelector("[data-copy]") as HTMLButtonElement;
  const langList = root.querySelector("[data-send-tv-lang-list]") as HTMLElement;
  const joinBtn = root.querySelector("[data-join-phones]") as HTMLButtonElement;
  const joinDialog = root.querySelector("[data-join-phones-dialog]") as HTMLDialogElement;
  const joinQr = root.querySelector("[data-join-phones-qr]") as HTMLElement;
  const joinUrlEl = root.querySelector("[data-join-phones-url]") as HTMLElement;
  const copyJoinBtn = root.querySelector("[data-copy-join]") as HTMLButtonElement;
  const reclaimBtn = root.querySelector("[data-reclaim]") as HTMLButtonElement;
  const screen = root.querySelector(".phone-screen") as HTMLElement;
  const smartLayer = root.querySelector("[data-smart-view-layer]") as HTMLElement;
  const smartEnter = root.querySelector("[data-smart-view-mode]") as HTMLButtonElement;
  const smartExit = root.querySelector("[data-exit-smart-view]") as HTMLButtonElement;
  const smartMic = root.querySelector("[data-smart-mic]") as HTMLButtonElement;
  const smartCaptions = root.querySelector(".smart-view-captions") as HTMLElement;
  const svBoard = root.querySelector("[data-sv-board]") as HTMLElement;
  const landscapeMq = window.matchMedia("(orientation: landscape)");
  const offlineBtn = root.querySelector("[data-offline-mode]") as HTMLButtonElement;
  const offlineBanner = root.querySelector("[data-offline-banner]") as HTMLElement;
  const setupDialog = root.querySelector("[data-local-setup-dialog]") as HTMLDialogElement;
  const setupOpen = root.querySelector("[data-local-setup-open]") as HTMLButtonElement;
  const setupClose = root.querySelector("[data-local-setup-close]") as HTMLButtonElement;
  const localSetup = root.querySelector("[data-local-setup]") as HTMLElement;

  const syncSmartViewOrientation = () => {
    const landscape = landscapeMq.matches || window.innerWidth > window.innerHeight;
    smartCaptions.dataset.orientation = landscape ? "landscape" : "portrait";
  };

  const els = {
    room: root.querySelector("[data-room]") as HTMLElement,
    status: root.querySelector("[data-status]") as HTMLElement,
    dot: root.querySelector("[data-dot]") as HTMLElement,
    mic: root.querySelector("[data-mic]") as HTMLButtonElement,
    micLabel: root.querySelector("[data-mic-label]") as HTMLElement,
    error: root.querySelector("[data-error]") as HTMLElement,
    preview: root.querySelector("[data-preview]") as HTMLElement,
    phoneBoard: root.querySelector("[data-phone-board]") as HTMLElement,
    svRoom: root.querySelector("[data-sv-room]") as HTMLElement,
    svStatus: root.querySelector("[data-sv-status]") as HTMLElement,
    svDot: root.querySelector("[data-sv-dot]") as HTMLElement,
    smartMicLabel: root.querySelector("[data-smart-mic-label]") as HTMLElement,
    floor: root.querySelector("[data-floor]") as HTMLElement,
  };

  function renderDynamic() {
    els.room.textContent = state.room;
    const blocked = floorHeldByOther(floor, peerId);
    const holding = isFloorHolder(floor, peerId);
    const tvNote = peers.tvs > 0 ? t("tvConnected", { n: peers.tvs }) : t("waitingForTv");
    const guestNote = peers.guests > 0 ? t("onPhonesSuffix", { n: peers.guests }) : "";
    const connNote = connStatus === "live" ? `${tvNote}${guestNote}` : connStatus === "connecting" ? t("connecting") : t("reconnecting");
    els.status.textContent = state.listening ? t("listeningDot", { note: connNote }) : connNote;
    els.dot.className = `dot ${state.listening ? "listening" : connStatus === "live" ? "live" : "offline"}`;
    els.mic.classList.toggle("hot", holding && state.listening);
    els.mic.disabled = blocked;
    els.mic.setAttribute("aria-pressed", String(holding && state.listening));
    els.micLabel.textContent = holding && state.listening ? t("stop") : blocked ? t("wait") : t("start");
    if (blocked) {
      els.floor.textContent = displayCopy(someoneElseSpeaking(floor));
    } else if (holding && state.listening) {
      els.floor.textContent = t("youreSpeaking");
    } else if (peers.guests > 0) {
      els.floor.textContent = t("floorMicFreeGuests");
    } else {
      els.floor.textContent = "";
    }
    reclaimBtn.hidden = !blocked;
    els.error.textContent = displayCopy(error);
    const lastFinal = finalizedLines(state.lines).at(-1);
    const spoken = previewCaption(lastFinal, state.sourceLang);
    if (liveInterim && holding) {
      els.preview.textContent = liveInterim;
    } else if (spoken) {
      els.preview.textContent = spoken;
    } else if (holding && state.listening) {
      els.preview.textContent = t("listeningEllipsis");
    } else {
      els.preview.textContent = t("captionsWillAppear");
    }
    els.preview.classList.toggle("interim", Boolean(liveInterim && holding) || (holding && state.listening && !lastFinal));
    const live =
      liveInterim && holding
        ? { text: liveInterim, sourceLang: state.sourceLang, speaker: hostSpeaker() }
        : null;
    const boardState = {
      layout: state.layout,
      lines: finalizedLines(state.lines),
      listening: state.listening,
      floor,
    };
    paintCaptionBoard(els.phoneBoard, boardState, live);

    screen.classList.toggle("is-smart-view", smartViewMode);
    smartLayer.hidden = !smartViewMode;
    if (smartViewMode) syncSmartViewOrientation();
    smartEnter.setAttribute("aria-pressed", String(smartViewMode));
    smartMic.classList.toggle("hot", holding && state.listening);
    smartMic.disabled = blocked;
    smartMic.setAttribute("aria-pressed", String(holding && state.listening));
    els.smartMicLabel.textContent = holding && state.listening ? t("stop") : blocked ? t("wait") : t("start");
    els.svRoom.textContent = state.room;
    const speaker =
      blocked && floor.holderName
        ? displayCopy(someoneElseSpeaking(floor))
        : state.listening
          ? t("listeningSmart")
          : t("smartViewStatus");
    els.svStatus.textContent = speaker;
    els.svDot.className = `dot ${state.listening ? "listening" : connStatus === "live" ? "live" : "offline"}`;
    if (smartViewMode) paintCaptionBoard(svBoard, boardState, live);

    for (const btn of root.querySelectorAll<HTMLButtonElement>(
      "[data-source] [data-lang], [data-smart-source] [data-lang]",
    )) {
      const on = btn.dataset.lang === state.sourceLang;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
      if (btn.classList.contains("smart-view-source-chip") && isLang(btn.dataset.lang)) {
        btn.setAttribute("aria-label", t("spokenLanguageNamed", { name: LANG_LABEL[btn.dataset.lang] }));
      }
    }
    for (const btn of layoutBox.querySelectorAll<HTMLButtonElement>("[data-layout]")) {
      btn.classList.toggle("active", btn.dataset.layout === state.layout);
    }
  }

  function hostSpeaker(): string {
    return captionSpeakerName(floor.holderName, HOST_NAME);
  }

  function setLiveInterim(text: string) {
    const next = text.trim();
    if (next === liveInterim) return;
    liveInterim = next;
    renderDynamic();
  }

  async function publishFinal(text: string, coalesce = true) {
    const spoken = text.trim();
    if (!spoken) return;
    liveInterim = "";
    renderDynamic();
    const epoch = publishEpoch;
    const from = detectLang(spoken, state.sourceLang);
    const translated = await translateAll(translator, spoken, from);
    if (epoch !== publishEpoch) return;
    lastCaptionWasMock = translator.id === "mock";
    paintLimitedBanner();
    const line: CaptionLine = {
      id: crypto.randomUUID(),
      isFinal: true,
      text: translated,
      speaker: hostSpeaker(),
      at: Date.now(),
    };
    const lines = coalesce
      ? applyFinalLine(state.lines, line, from)
      : appendFinalLine(state.lines, line);
    setState({ ...state, lines });
  }

  let publishQueue: Promise<void> = Promise.resolve();
  const queuePublish = (text: string, coalesce = true) => {
    publishQueue = publishQueue.then(() => publishFinal(text, coalesce)).catch(() => undefined);
  };

  const releaseWake = () => {
    void wakeLock?.release();
    wakeLock = null;
  };

  const requestWake = async () => {
    try {
      wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      /* Chrome may deny if the tab is in the background */
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
    if (isFloorHolder(floor, peerId)) {
      stopLocalMic();
      pendingFinal = "";
      void (async () => {
        await conn?.releaseFloor();
        setState({ ...state, listening: false });
      })();
      return;
    }
    if (floorHeldByOther(floor, peerId)) {
      error = someoneElseSpeaking(floor);
      renderDynamic();
      return;
    }
    // Start on the click stack. iOS rejects recognition.start() after an await.
    // Prime es-ES / pt-BR on the reused recognizer before start().
    speech.setLang(speechLocale(state.sourceLang), true);
    speech.start();
    void (async () => {
      const ok = (await conn?.claimFloor(HOST_NAME)) ?? false;
      if (!ok) {
        speech.stop();
        pendingFinal = "";
        error = someoneElseSpeaking(floor);
        renderDynamic();
        return;
      }
      if (isSpeechFallbackMessage(error) && !isNonFatalSpeechNote(error)) {
        speech.stop();
        releaseWake();
        typeForm.hidden = false;
        pendingFinal = "";
        setState({ ...state, listening: false });
        return;
      }
      void requestWake();
      setState({ ...state, listening: true });
      const queued = pendingFinal.trim();
      pendingFinal = "";
      if (queued) queuePublish(queued);
    })();
  };

  const onReclaim = () => {
    error = "";
    // start() in this tap. iOS rejects recognition.start() after an await.
    speech.setLang(speechLocale(state.sourceLang), true);
    speech.start();
    void (async () => {
      const freed = (await conn?.forceRelease()) ?? false;
      if (!freed) {
        speech.stop();
        error = "Could not reclaim the mic."; // stored in English; displayCopy translates it
        renderDynamic();
        return;
      }
      const ok = (await conn?.claimFloor(HOST_NAME)) ?? false;
      if (!ok) {
        speech.stop();
        error = someoneElseSpeaking(floor);
        renderDynamic();
        return;
      }
      if (isSpeechFallbackMessage(error) && !isNonFatalSpeechNote(error)) {
        speech.stop();
        typeForm.hidden = false;
        setState({ ...state, listening: false });
        return;
      }
      void requestWake();
      setState({ ...state, listening: true });
    })();
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible" && state.listening) void requestWake();
  };

  // Same final-only push as Join. iPhone no-speech-after-words still lands here as one final.
  speech.onResult = (result) => {
    error = "";
    if (result.isFinal) {
      if (isFloorHolder(floor, peerId)) {
        pendingFinal = "";
        queuePublish(result.text);
      } else if (!floorHeldByOther(floor, peerId)) {
        pendingFinal = result.text;
      }
      return;
    }
    if (!isFloorHolder(floor, peerId)) return;
    setLiveInterim(result.text);
  };
  speech.onError = (message) => {
    error = message;
    if (isNonFatalSpeechNote(message)) {
      typeForm.hidden = false;
      renderDynamic();
      return;
    }
    if (isSpeechFallbackMessage(message)) {
      speech.stop();
      releaseWake();
      typeForm.hidden = false;
      liveInterim = "";
      if (message.includes("Microphone blocked") || message.includes("no Web Speech")) {
        void conn?.releaseFloor();
      }
      setState({ ...state, listening: false });
      return;
    }
    renderDynamic();
  };

  const onSource = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-lang]");
    if (!btn?.dataset.lang) return;
    const sourceLang = btn.dataset.lang as Lang;
    if (!isLang(sourceLang)) return;
    sourceTouched = true;
    if (sourceLang !== state.sourceLang) liveInterim = "";
    // While listening, setLang retargets the recognizer in this tap.
    // Chrome rebuilds it. iOS reuses the original object and only changes lang.
    speech.setLang(speechLocale(sourceLang), true);
    setState({ ...state, sourceLang });
  };

  const onLayout = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-layout]");
    if (!btn?.dataset.layout) return;
    setState({ ...state, layout: btn.dataset.layout as Layout });
  };

  const paintSendTv = () => {
    const url = tvUrl(room);
    qrBox.innerHTML = tvQrSvg(url, t("qrTv"));
    urlEl.textContent = url;
    langList.innerHTML = LANGS.map((lang) => {
      const langUrl = tvUrl(room, lang);
      return `
        <article class="send-tv-lang">
          <div class="send-tv-lang-qr">${tvQrSvg(langUrl, t("qrLang", { name: LANG_LABEL[lang] }))}</div>
          <div class="send-tv-lang-meta">
            <p class="control-label">${LANG_SHORT[lang]} · ${LANG_LABEL[lang]}</p>
            <p class="send-tv-lang-url">${escapeHtml(langUrl)}</p>
            <div class="send-tv-lang-actions">
              <button class="secondary" data-copy-lang="${lang}" type="button">${escapeHtml(t("copyLangLink", { lang: LANG_SHORT[lang] }))}</button>
              <button class="ghost" data-open-lang="${lang}" type="button">${escapeHtml(t("open"))}</button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  };

  const paintJoinPhones = () => {
    const url = joinUrl(room);
    joinQr.innerHTML = tvQrSvg(url, t("qrJoin"));
    joinUrlEl.textContent = url;
  };

  const onJoinPhones = () => {
    paintJoinPhones();
    copyJoinBtn.textContent = t("copyJoinLink");
    joinBtn.setAttribute("aria-expanded", "true");
    if (typeof joinDialog.showModal === "function") joinDialog.showModal();
    else joinDialog.setAttribute("open", "");
  };

  const onCloseJoinPhones = () => {
    joinBtn.setAttribute("aria-expanded", "false");
    if (typeof joinDialog.close === "function" && joinDialog.open) joinDialog.close();
    else joinDialog.removeAttribute("open");
  };

  const onJoinDialogClose = () => {
    joinBtn.setAttribute("aria-expanded", "false");
  };

  const onJoinDialogClick = (event: Event) => {
    if (event.target === joinDialog) onCloseJoinPhones();
  };

  const onCopyJoin = async () => {
    const url = joinUrl(room);
    try {
      await navigator.clipboard.writeText(url);
      error = "Join link copied.";
      copyJoinBtn.textContent = t("copied");
      window.clearTimeout(copyJoinTimer);
      copyJoinTimer = window.setTimeout(() => {
        copyJoinBtn.textContent = t("copyJoinLink");
      }, 1600);
      renderDynamic();
    } catch {
      error = url;
      copyJoinBtn.textContent = t("copyJoinLink");
      renderDynamic();
    }
  };

  const setSmartViewMode = (next: boolean) => {
    smartViewMode = next;
    if (next) onCloseSendTv();
    renderDynamic();
  };

  const onEnterSmartView = () => setSmartViewMode(true);
  const onExitSmartView = () => setSmartViewMode(false);

  const onOpenLocalSetup = () => {
    if (typeof setupDialog.showModal === "function") setupDialog.showModal();
    else setupDialog.setAttribute("open", "");
  };

  const onCloseLocalSetup = () => {
    if (typeof setupDialog.close === "function" && setupDialog.open) setupDialog.close();
    else setupDialog.removeAttribute("open");
  };

  const onSetupDialogClick = (event: Event) => {
    if (event.target === setupDialog) onCloseLocalSetup();
  };

  const onSendTv = () => {
    paintSendTv();
    copyBtn.textContent = t("copyTvLink");
    sendBtn.setAttribute("aria-expanded", "true");
    if (typeof sendDialog.showModal === "function") sendDialog.showModal();
    else sendDialog.setAttribute("open", "");
  };

  const onCloseSendTv = () => {
    sendBtn.setAttribute("aria-expanded", "false");
    if (typeof sendDialog.close === "function" && sendDialog.open) sendDialog.close();
    else sendDialog.removeAttribute("open");
  };

  const onDialogClose = () => {
    sendBtn.setAttribute("aria-expanded", "false");
  };

  const onDialogClick = (event: Event) => {
    if (event.target === sendDialog) onCloseSendTv();
  };

  const onOpenTv = () => window.open(tvUrl(room), "mt-tv", "noopener");
  const onLangActions = (event: Event) => {
    const target = event.target as HTMLElement;
    const openBtn = target.closest<HTMLButtonElement>("[data-open-lang]");
    const copyLangBtn = target.closest<HTMLButtonElement>("[data-copy-lang]");
    const langValue = openBtn?.dataset.openLang ?? copyLangBtn?.dataset.copyLang;
    if (!isLang(langValue)) return;
    const url = tvUrl(room, langValue);
    if (openBtn) {
      window.open(url, `mt-tv-${langValue}`, "noopener");
      return;
    }
    if (!copyLangBtn) return;
    void (async () => {
      const restore = t("copyLangLink", { lang: LANG_SHORT[langValue] });
      try {
        await navigator.clipboard.writeText(url);
        error = `${LANG_SHORT[langValue]} TV link copied.`;
        copyLangBtn.textContent = t("copied");
        window.clearTimeout(copyLangTimers[langValue]);
        copyLangTimers[langValue] = window.setTimeout(() => {
          copyLangBtn.textContent = restore;
        }, 1600);
        renderDynamic();
      } catch {
        error = url;
        copyLangBtn.textContent = restore;
        renderDynamic();
      }
    })();
  };
  const onCopy = async () => {
    const url = tvUrl(room);
    try {
      await navigator.clipboard.writeText(url);
      error = "TV link copied.";
      copyBtn.textContent = t("copied");
      window.clearTimeout(copyLabelTimer);
      copyLabelTimer = window.setTimeout(() => {
        copyBtn.textContent = t("copyTvLink");
      }, 1600);
      renderDynamic();
    } catch {
      error = url;
      copyBtn.textContent = t("copyTvLink");
      renderDynamic();
    }
  };
  const onClear = () => {
    liveInterim = "";
    publishEpoch += 1;
    setState({ ...state, lines: [] });
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
      const input = typeForm.elements.namedItem("caption") as HTMLInputElement;
      const text = input.value.trim();
      if (!text) return;
      if (floorHeldByOther(floor, peerId)) {
        error = someoneElseSpeaking(floor);
        renderDynamic();
        return;
      }
      if (!isFloorHolder(floor, peerId)) {
        const ok = (await conn?.claimFloor(HOST_NAME)) ?? false;
        if (!ok) {
          error = someoneElseSpeaking(floor);
          renderDynamic();
          return;
        }
      }
      input.value = "";
      queuePublish(text, false);
    })();
  };

  const onOrientationChange = () => syncSmartViewOrientation();
  landscapeMq.addEventListener("change", onOrientationChange);
  window.addEventListener("resize", onOrientationChange);
  window.addEventListener("orientationchange", onOrientationChange);
  syncSmartViewOrientation();

  els.mic.addEventListener("click", onMic);
  document.addEventListener("visibilitychange", onVisibility);
  sourceBox.addEventListener("click", onSource);
  smartSourceBox.addEventListener("click", onSource);
  layoutBox.addEventListener("click", onLayout);
  sendBtn.addEventListener("click", onSendTv);
  joinBtn.addEventListener("click", onJoinPhones);
  reclaimBtn.addEventListener("click", onReclaim);
  smartEnter.addEventListener("click", onEnterSmartView);
  smartExit.addEventListener("click", onExitSmartView);
  smartMic.addEventListener("click", onMic);
  const paintLimitedBanner = () => {
    offlineBanner.hidden = !(isOfflineMeeting() || lastCaptionWasMock);
  };
  const unbindOffline = bindOfflineModeToggle(offlineBtn, {
    banner: offlineBanner,
    bannerWhen: () => lastCaptionWasMock,
    onChange: () => paintLimitedBanner(),
  });
  const unbindSetup = bindLocalSetup(localSetup);
  setupOpen.addEventListener("click", onOpenLocalSetup);
  setupClose.addEventListener("click", onCloseLocalSetup);
  setupDialog.addEventListener("click", onSetupDialogClick);
  root.querySelector("[data-send-tv-close]")?.addEventListener("click", onCloseSendTv);
  sendDialog.addEventListener("click", onDialogClick);
  sendDialog.addEventListener("close", onDialogClose);
  joinDialog.addEventListener("click", onJoinDialogClick);
  joinDialog.addEventListener("close", onJoinDialogClose);
  root.querySelector("[data-join-phones-close]")?.addEventListener("click", onCloseJoinPhones);
  copyJoinBtn.addEventListener("click", onCopyJoin);
  root.querySelector("[data-open-tv]")?.addEventListener("click", onOpenTv);
  langList.addEventListener("click", onLangActions);
  copyBtn.addEventListener("click", onCopy);
  root.querySelector("[data-clear]")?.addEventListener("click", onClear);
  root.querySelector("[data-home]")?.addEventListener("click", onHome);
  typeForm.addEventListener("submit", onType);

  conn = connectRoom({
    room,
    role: "phone",
    name: HOST_NAME,
    onJoined(info) {
      peerId = info.peerId;
      floor = info.floor ?? floor;
      state = { ...state, floor };
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
        setState({ ...state, listening: false }, false);
        return;
      }
      if (isFloorHolder(next, peerId) && error.startsWith("Someone else is speaking")) error = "";
      state = { ...state, floor: next };
      renderDynamic();
    },
    onState(next) {
      const holding = keepsLocalCaptions(floor, next.floor, peerId);
      floor = reconcileFloor(floor, next.floor, peerId);
      if (!hydrated) {
        hydrated = true;
        state = {
          ...next,
          room,
          floor,
          listening: false,
          sourceLang:
            sourceTouched && isLang(state.sourceLang)
              ? state.sourceLang
              : isLang(next.sourceLang)
                ? next.sourceLang
                : state.sourceLang,
          lines: finalizedLines(next.lines ?? []),
        };
        speech.setLang(speechLocale(state.sourceLang));
        renderDynamic();
        return;
      }
      state = {
        ...state,
        floor,
        layout: next.layout ?? state.layout,
        lines: holding ? state.lines : finalizedLines(next.lines ?? []),
        listening: holding ? state.listening : Boolean(next.listening),
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

  const unbindLang = bindUiLang(root, () => {
    renderDynamic();
    paintSendTv();
    paintJoinPhones();
  });
  renderDynamic();

  return () => {
    speech.stop();
    releaseWake();
    conn?.close();
    window.clearTimeout(copyLabelTimer);
    window.clearTimeout(copyJoinTimer);
    for (const timer of Object.values(copyLangTimers)) window.clearTimeout(timer);
    landscapeMq.removeEventListener("change", onOrientationChange);
    window.removeEventListener("resize", onOrientationChange);
    window.removeEventListener("orientationchange", onOrientationChange);
    document.removeEventListener("visibilitychange", onVisibility);
    els.mic.removeEventListener("click", onMic);
    sourceBox.removeEventListener("click", onSource);
    smartSourceBox.removeEventListener("click", onSource);
    layoutBox.removeEventListener("click", onLayout);
    sendDialog.removeEventListener("click", onDialogClick);
    sendDialog.removeEventListener("close", onDialogClose);
    sendBtn.removeEventListener("click", onSendTv);
    smartEnter.removeEventListener("click", onEnterSmartView);
    smartExit.removeEventListener("click", onExitSmartView);
    smartMic.removeEventListener("click", onMic);
    unbindOffline();
    unbindSetup();
    setupOpen.removeEventListener("click", onOpenLocalSetup);
    setupClose.removeEventListener("click", onCloseLocalSetup);
    setupDialog.removeEventListener("click", onSetupDialogClick);
    onCloseLocalSetup();
    typeForm.removeEventListener("submit", onType);
    langList.removeEventListener("click", onLangActions);
    reclaimBtn.removeEventListener("click", onReclaim);
    joinBtn.removeEventListener("click", onJoinPhones);
    joinDialog.removeEventListener("click", onJoinDialogClick);
    joinDialog.removeEventListener("close", onJoinDialogClose);
    copyJoinBtn.removeEventListener("click", onCopyJoin);
    onCloseJoinPhones();
    onCloseSendTv();
    unbindLang();
  };
}
