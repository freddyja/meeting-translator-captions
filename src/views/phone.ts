import { brandBlock, creditFooter } from "../brand";
import {
  appendFinalLine,
  applyFinalLine,
  finalizedLines,
  previewCaption,
  provisionalLine,
  revisionOfLast,
  settleProvisional,
} from "../caption-history";
import { escapeHtml } from "../dom";
import { bindUiLang, displayCopy, t, uiLangSwitcherHtml } from "../i18n";
import { bindLocalSetup, localSetupInnerHtml } from "../local-setup";
import { bindOfflineModeToggle, isOfflineMeeting } from "../offline-mode";
import { tvQrSvg } from "../qr";
import { mountMoreMenu } from "../input/more-menu";
import { swapHostLangs } from "../lang-swap";
import { connectRoom, type RoomConnection } from "../realtime/client";
import { withLinkToken } from "../auth";
import { goto, joinUrl, tvUrl as plainTvUrl } from "../router";

/** TV links carry this device's token in #k= so the TV skips the PIN pad. Join links never do. */
const tvUrl: typeof plainTvUrl = (room, lang) => withLinkToken(plainTvUrl(room, lang));
import { createWebSpeechProvider, isNonFatalSpeechNote, isSpeechFallbackMessage } from "../stt/web-speech";
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
  isLang,
  keepsLocalCaptions,
  lostFloor,
  reconcileFloor,
  LANG_LABEL,
  LANG_SHORT,
  LANGS,
  LAYOUTS,
  type Layout as LayoutId,
  RECONNECTING,
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
import { trackSpeech } from "../update/activity";
import { bindHapticsToggle, hapticsToggleHtml } from "../haptics-toggle";
import { micUi, shouldReleaseTypedFloor } from "../mic-ui";
import { detectSpeechCapability } from "../stt/capability";
import { confirmLeave } from "./confirm";
import { markMeetingUsed, openTour } from "./onboarding-ui";

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
  const speech = trackSpeech(createWebSpeechProvider());
  let state = { ...emptyState(room), sourceLang: readSpokenLang() };
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
  let liveDraftLang: Lang = state.sourceLang;
  let lastCaptionWasMock = false;
  let pendingSpeech: { text: string; lang: Lang } | null = null;
  let peerId: string | null = null;
  let floor: FloorState = emptyFloor();
  /** Set by a fatal speech error; checked after an in-flight floor claim. */
  let speechFailed = false;
  /** Live mic session on this phone. A Type + Send floor claim is not one. */
  let micActive = false;
  /** Captions queued or translating. */
  let publishing = 0;
  const canListen = detectSpeechCapability().canListen;

  const push = () => conn?.push(state);

  const setState = (next: RoomState, sync = true) => {
    state = { ...next, floor };
    renderDynamic();
    if (sync) push();
  };

  root.innerHTML = `
    <section class="screen phone-screen scene-bg ux-host">
      <div class="phone-top host-top">
        ${brandBlock(true)}
        <div class="host-top-actions">
          <button class="secondary help-btn" data-help type="button" data-i18n="helpBtn" data-i18n-aria="helpAria"></button>
          <button class="secondary leave-btn" data-home type="button" data-i18n="endMeeting"></button>
        </div>
      </div>
      <div class="phone-status host-status">
        <div class="room-pill"><span data-i18n="roomWord"></span> <strong data-room></strong></div>
        <div class="status-pill"><span class="dot" data-dot></span><span data-status></span></div>
      </div>

      <div class="phone-body">
        <div class="phone-main">
          <div class="preview phone-caption-preview" hidden>
            <p class="control-label" data-i18n="onThisPhone"></p>
            <p data-preview></p>
          </div>
          <div class="tv-board phone-live-board" data-phone-board></div>
        </div>

        <div class="phone-side">
          <p class="floor-banner" data-floor role="status" aria-live="polite"></p>
          <div class="mic-wrap">
            <button class="mic mic-big" data-mic type="button" aria-pressed="false">
              <span class="mic-big-label" data-mic-label></span>
            </button>
            <button class="ghost spoken-now" data-spoken-now type="button"></button>
            <p class="hint" data-error></p>
            <button class="secondary floor-reclaim" data-reclaim type="button" hidden data-i18n="reclaimMic"></button>
          </div>

          <div class="host-main-actions">
            <button class="primary big-action join-phones-btn" data-join-phones type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="join-phones-dialog" data-i18n-aria="joinPhonesAria"><span aria-hidden="true">📱</span> <span data-i18n="showJoinQr"></span></button>
            <button class="primary big-action send-tv-btn" data-send-tv type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="send-tv-dialog" data-i18n-aria="sendToTvAria"><span aria-hidden="true">📺</span> <span data-i18n="sendToTv"></span></button>
          </div>

          <div class="host-secondary-actions">
            <button class="secondary type-toggle" data-type-toggle type="button" aria-expanded="false" data-i18n="typeInstead"></button>
            <button class="secondary settings-btn" data-settings-open type="button" aria-haspopup="dialog" aria-controls="host-settings-dialog" data-i18n="settings"></button>
          </div>
          <div class="type-area" data-type-area hidden>
            <form class="typed-caption" data-type>
              <input name="caption" autocomplete="off" enterkeyhint="send" data-i18n-placeholder="typeCaption" />
              <button class="primary" type="submit" data-i18n="send"></button>
            </form>
            <div class="more-bar" data-more-bar></div>
          </div>
        </div>
      </div>

      ${creditFooter()}

      <dialog class="send-tv-dialog settings-dialog" id="host-settings-dialog" data-settings-dialog aria-labelledby="host-settings-title">
        <div class="send-tv-sheet controls">
          <header class="send-tv-head">
            <h2 id="host-settings-title" data-i18n="settingsTitle"></h2>
            <button class="secondary send-tv-close" data-settings-close type="button" data-i18n="close"></button>
          </header>
          ${uiLangSwitcherHtml("entry")}
          <div class="settings-group">
            <p class="control-label" data-i18n="spokenLanguage"></p>
            <div class="chips" data-source></div>
          </div>
          <div class="settings-group">
            <p class="control-label lang-label-row"><span data-i18n="watchLanguage"></span><button class="swap-icon" data-swap type="button" data-i18n-aria="swapAria"><span aria-hidden="true">⇄</span></button></p>
            <div class="chips" data-layouts></div>
          </div>
          <div class="settings-group meeting-mode">
            <p class="control-label" data-i18n="meetingMode"></p>
            <button class="chip" data-offline-mode type="button" aria-pressed="false" data-i18n="offlineLocal" data-i18n-aria="offlineAria"></button>
            <p class="hint" data-i18n="offlineHint"></p>
            <p class="offline-banner" data-offline-banner hidden>
              <span data-i18n="offlineBannerBefore"></span><button class="ghost setup-link" data-local-setup-open type="button" aria-haspopup="dialog" aria-controls="local-setup-dialog" data-i18n="laptopSteps"></button><span data-i18n="offlineBannerAfter"></span>
            </p>
          </div>
          <div class="settings-group settings-buttons">
            <button class="secondary smart-view-btn" data-smart-view-mode type="button" aria-pressed="false" data-i18n="smartViewMode" data-i18n-aria="smartViewAria"></button>
            <button class="secondary" data-clear type="button" data-i18n="clearWindows"></button>
          </div>
          ${hapticsToggleHtml()}
          <details class="settings-advanced">
            <summary data-i18n="advanced"></summary>
            <p class="hint" data-i18n="micChromeHint"></p>
            <button class="secondary" data-local-setup-open type="button" aria-haspopup="dialog" aria-controls="local-setup-dialog" data-i18n="advancedSetupBtn"></button>
          </details>
        </div>
      </dialog>

      <dialog class="send-tv-dialog" id="send-tv-dialog" data-send-tv-dialog aria-labelledby="send-tv-title">
        <div class="send-tv-sheet">
          <header class="send-tv-head">
            <h2 id="send-tv-title" data-i18n="sendToTv"></h2>
            <button class="secondary send-tv-close" data-send-tv-close type="button" data-i18n="close"></button>
          </header>
          <div class="send-tv-qr send-tv-qr-big" data-send-tv-qr></div>
          <p class="send-tv-url" data-send-tv-url></p>
          <button class="primary big-action send-tv-share" data-share-tv type="button"><span aria-hidden="true">📺</span> <span data-i18n="openOnTv"></span></button>
          <ol class="send-tv-steps">
            <li data-i18n="sendTvStep1"></li>
            <li data-i18n="sendTvStep2"></li>
          </ol>
          <details class="more-tv-options" data-more-tv>
            <summary data-i18n="moreTvOptions"></summary>
            <div class="row-actions">
              <button class="secondary send-tv-copy" data-copy type="button" data-i18n="copyTvLink"></button>
              <button class="secondary send-tv-open" data-open-tv type="button" data-i18n="openTvView" data-i18n-aria="openTvAria"></button>
            </div>
            <section class="send-tv-langs" data-send-tv-langs>
              <h3 data-i18n="oneLanguagePerMonitor"></h3>
              <p class="hint" data-i18n="perMonitorHint"></p>
              <div class="send-tv-lang-list" data-send-tv-lang-list></div>
            </section>
          </details>
        </div>
      </dialog>

      <dialog class="send-tv-dialog" id="join-phones-dialog" data-join-phones-dialog aria-labelledby="join-phones-title">
        <div class="send-tv-sheet">
          <header class="send-tv-head">
            <h2 id="join-phones-title" data-i18n="showJoinQr"></h2>
            <button class="secondary send-tv-close" data-join-phones-close type="button" data-i18n="close"></button>
          </header>
          <p class="hint" data-i18n="scanToWatch"></p>
          <div class="send-tv-qr send-tv-qr-big" data-join-phones-qr></div>
          <p class="join-room-big"><span data-i18n="roomCode"></span> <strong data-join-room-code></strong></p>
          <p class="send-tv-url" data-join-phones-url></p>
          <button class="secondary send-tv-copy" data-copy-join type="button" data-i18n="copyJoinLink"></button>
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
            <button class="secondary send-tv-close" data-local-setup-close type="button" data-i18n="close"></button>
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
                <small data-smart-mic-label></small>
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
    (lang) => `<button class="chip" type="button" data-lang="${lang}">${LANG_LABEL[lang]}</button>`,
  ).join("");
  smartSourceBox.innerHTML = LANGS.map(
    (lang) =>
      `<button class="chip smart-view-source-chip" type="button" data-lang="${lang}" aria-label="${escapeHtml(t("spokenLanguageNamed", { name: LANG_LABEL[lang] }))}" aria-pressed="false">${LANG_LABEL[lang]}</button>`,
  ).join("");
  /** Full language names; the all-three layout reads "All three". */
  const layoutLabel = (id: LayoutId, fallback: string) => (id === "en-es-pt" ? t("watchAllName") : fallback);
  const paintLayoutChips = () => {
    layoutBox.innerHTML = LAYOUTS.map(
      (item) =>
        `<button class="chip${item.id === state.layout ? " active" : ""}" type="button" data-layout="${item.id}">${escapeHtml(layoutLabel(item.id, item.label))}</button>`,
    ).join("");
  };
  paintLayoutChips();

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
  const swapBtn = root.querySelector("[data-swap]") as HTMLButtonElement;
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
  const setupClose = root.querySelector("[data-local-setup-close]") as HTMLButtonElement;
  const localSetup = root.querySelector("[data-local-setup]") as HTMLElement;
  const setupOpeners = [...root.querySelectorAll<HTMLButtonElement>("[data-local-setup-open]")];
  const typeArea = root.querySelector("[data-type-area]") as HTMLElement;
  const typeToggle = root.querySelector("[data-type-toggle]") as HTMLButtonElement;
  const settingsDialog = root.querySelector("[data-settings-dialog]") as HTMLDialogElement;
  const settingsOpen = root.querySelector("[data-settings-open]") as HTMLButtonElement;
  const settingsClose = root.querySelector("[data-settings-close]") as HTMLButtonElement;
  const helpBtn = root.querySelector("[data-help]") as HTMLButtonElement;
  const spokenNow = root.querySelector("[data-spoken-now]") as HTMLButtonElement;
  const shareTvBtn = root.querySelector("[data-share-tv]") as HTMLButtonElement;
  const joinRoomCode = root.querySelector("[data-join-room-code]") as HTMLElement;

  /** Type + Send stays one tap away; it opens by itself when the mic cannot work. */
  const showTypeArea = (focus = false) => {
    typeArea.hidden = false;
    typeToggle.setAttribute("aria-expanded", "true");
    typeToggle.hidden = true;
    if (focus) (typeForm.elements.namedItem("caption") as HTMLInputElement).focus();
  };
  if (!canListen) showTypeArea();

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
    const live = connStatus === "live";
    const heldByOther = floorHeldByOther(floor, peerId);
    // Offline, the floor snapshot is stale: say Reconnecting, not "someone else".
    const blocked = live && heldByOther;
    const holding = isFloorHolder(floor, peerId);
    // Only a live mic on this phone counts as "listening". Type + Send holds the floor too.
    const mic = micUi({ holding, micLive: micActive && state.listening, blocked });
    const downNote = connStatus === "waking" ? t("wakingServer") : t("reconnecting");
    const tvNote = peers.tvs > 0 ? t("tvConnected", { n: peers.tvs }) : t("waitingForTv");
    const guestNote = peers.guests > 0 ? t("onPhonesSuffix", { n: peers.guests }) : "";
    const connNote = live ? `${tvNote}${guestNote}` : connStatus === "connecting" ? t("connecting") : downNote;
    els.status.textContent = mic.listening ? t("listeningDot", { note: connNote }) : connNote;
    els.dot.className = `dot ${mic.listening ? "listening" : connStatus === "live" ? "live" : "offline"}`;
    els.mic.classList.toggle("hot", mic.hot);
    els.mic.disabled = blocked;
    els.mic.setAttribute("aria-pressed", String(mic.hot));
    els.micLabel.textContent = mic.label === "stop" ? t("micTapToStop") : mic.label === "wait" ? t("micWaitTurn") : t("micTapToTalk");
    spokenNow.textContent = t("spokenLanguageNamed", { name: LANG_LABEL[state.sourceLang] });
    let floorState = "free";
    if (heldByOther && !live) {
      els.floor.textContent = downNote;
      floorState = "down";
    } else if (blocked) {
      els.floor.textContent = displayCopy(someoneElseSpeaking(floor));
      floorState = "busy";
    } else if (mic.listening) {
      els.floor.textContent = t("youreSpeaking");
      floorState = "you";
    } else if (peers.guests > 0) {
      els.floor.textContent = t("floorMicFreeGuests");
    } else {
      els.floor.textContent = t("floorMicFreeStart");
    }
    els.floor.dataset.state = floorState;
    reclaimBtn.hidden = !blocked;
    const translateNote = translateStatus() === "waking" ? t("translateWaking") : "";
    els.error.textContent = [displayCopy(error), translateNote].filter(Boolean).join(" ");
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
    const liveCaption =
      liveInterim && holding
        ? { text: liveInterim, sourceLang: state.sourceLang, draftLang: liveDraftLang, speaker: hostSpeaker() }
        : null;
    const boardState = {
      layout: state.layout,
      lines: finalizedLines(state.lines),
      listening: state.listening,
      floor,
    };
    paintCaptionBoard(els.phoneBoard, boardState, liveCaption);

    screen.classList.toggle("is-smart-view", smartViewMode);
    smartLayer.hidden = !smartViewMode;
    if (smartViewMode) syncSmartViewOrientation();
    smartEnter.setAttribute("aria-pressed", String(smartViewMode));
    smartMic.classList.toggle("hot", mic.hot);
    smartMic.disabled = blocked;
    smartMic.setAttribute("aria-pressed", String(mic.hot));
    els.smartMicLabel.textContent = mic.label === "stop" ? t("stop") : mic.label === "wait" ? t("wait") : t("start");
    els.svRoom.textContent = state.room;
    const speaker =
      heldByOther && !live
        ? downNote
        : blocked && floor.holderName
        ? displayCopy(someoneElseSpeaking(floor))
        : mic.listening
          ? t("listeningSmart")
          : t("smartViewStatus");
    els.svStatus.textContent = speaker;
    els.svDot.className = `dot ${mic.listening ? "listening" : connStatus === "live" ? "live" : "offline"}`;
    if (smartViewMode) paintCaptionBoard(svBoard, boardState, liveCaption);

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
    const canSwap = Boolean(swapHostLangs(state.sourceLang, state.layout));
    swapBtn.disabled = !canSwap;
    swapBtn.title = canSwap ? t("swapAria") : t("swapNeedsOne");
  }

  function hostSpeaker(): string {
    return captionSpeakerName(floor.holderName, HOST_NAME);
  }

  function setLiveInterim(text: string, lang: Lang = state.sourceLang) {
    const next = text.trim();
    if (next === liveInterim && (!next || lang === liveDraftLang)) return;
    liveInterim = next;
    if (next) liveDraftLang = lang;
    renderDynamic();
  }

  async function publishFinal(text: string, coalesce = true, speechLang?: Lang) {
    const spoken = text.trim();
    if (!spoken) return;
    liveInterim = "";
    const epoch = publishEpoch;
    const hint = speechLang ?? state.sourceLang;
    const paneLang = detectLang(spoken, hint);
    const history = finalizedLines(state.lines);
    const last = history.at(-1);
    // Unchanged words (a repeated final): nothing to show, nothing to translate.
    if (coalesce && revisionOfLast(last?.text[paneLang], spoken) === "duplicate") {
      renderDynamic();
      return;
    }
    // Show the original at once on every screen; translations fill in after.
    const speaker = hostSpeaker();
    const provisional = provisionalLine(spoken, paneLang, speaker, coalesce ? last : undefined);
    const shown = coalesce
      ? applyFinalLine(state.lines, provisional, paneLang)
      : appendFinalLine(state.lines, provisional);
    const lineId = shown.at(-1)?.id ?? provisional.id;
    setState({ ...state, lines: shown });
    const translated = await translateAll(translator, spoken, hint);
    const from = spokenKey(spoken, translated, hint);
    if (epoch !== publishEpoch) return;
    lastCaptionWasMock = translator.id === "mock";
    paintLimitedBanner();
    const line: CaptionLine = {
      id: lineId,
      isFinal: true,
      text: translated,
      speaker,
      at: provisional.at,
    };
    setState({ ...state, lines: settleProvisional(state.lines, line, from, coalesce) });
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

  /** A typed message is done: hand the speaking turn back so the mic is free for everyone. */
  const releaseTypedFloor = () => {
    if (!shouldReleaseTypedFloor({ holding: isFloorHolder(floor, peerId), micLive: micActive, publishing })) return;
    void (async () => {
      await conn?.releaseFloor();
      if (!micActive) setState({ ...state, listening: false });
    })();
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
    micActive = false;
    speech.stop();
    releaseWake();
    liveInterim = "";
    state = { ...state, listening: false, floor };
  };

  const onMic = () => {
    error = "";
    if (isFloorHolder(floor, peerId)) {
      stopLocalMic();
      pendingSpeech = null;
      void (async () => {
        await conn?.releaseFloor();
        setState({ ...state, listening: false });
      })();
      return;
    }
    if (floorHeldByOther(floor, peerId)) {
      error = floorBusyCopy(connStatus, floor);
      renderDynamic();
      return;
    }
    // Start on the click stack. iOS rejects recognition.start() after an await.
    // Prime es-ES / pt-BR on the reused recognizer before start().
    speechFailed = false;
    speech.setLang(speechLocale(state.sourceLang), true);
    speech.start();
    void (async () => {
      const ok = (await conn?.claimFloor(HOST_NAME)) ?? false;
      if (!ok) {
        speech.stop();
        pendingSpeech = null;
        error = floorBusyCopy(connStatus, floor);
        renderDynamic();
        return;
      }
      if (speechFailed) {
        // The mic died while the claim was in flight. Give the floor back.
        speech.stop();
        releaseWake();
        showTypeArea();
        pendingSpeech = null;
        void conn?.releaseFloor();
        setState({ ...state, listening: false });
        return;
      }
      void requestWake();
      micActive = true;
      setState({ ...state, listening: true });
      const queued = pendingSpeech;
      pendingSpeech = null;
      if (queued?.text.trim()) queuePublish(queued.text, true, queued.lang);
    })();
  };

  const onReclaim = () => {
    error = "";
    // start() in this tap. iOS rejects recognition.start() after an await.
    speechFailed = false;
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
        error = floorBusyCopy(connStatus, floor);
        renderDynamic();
        return;
      }
      if (speechFailed) {
        speech.stop();
        showTypeArea();
        void conn?.releaseFloor();
        setState({ ...state, listening: false });
        return;
      }
      void requestWake();
      micActive = true;
      setState({ ...state, listening: true });
    })();
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible" && state.listening) void requestWake();
  };

  // Same final-only push as Join. iPhone no-speech-after-words still lands here as one final.
  speech.onResult = (result) => {
    error = "";
    const heard = speechSourceLang(result.text, state.sourceLang, result.locale);
    if (result.isFinal) {
      if (isFloorHolder(floor, peerId)) {
        pendingSpeech = null;
        queuePublish(result.text, true, heard);
      } else if (!floorHeldByOther(floor, peerId)) {
        pendingSpeech = { text: result.text, lang: heard };
      }
      return;
    }
    if (!isFloorHolder(floor, peerId)) return;
    setLiveInterim(result.text, heard);
  };
  speech.onError = (message) => {
    error = message;
    if (isNonFatalSpeechNote(message)) {
      showTypeArea();
      renderDynamic();
      return;
    }
    // Every other error ends recognition (the provider already cleared
    // wantListening). Never sit on the floor with a dead mic.
    speechFailed = true;
    speech.stop();
    releaseWake();
    if (isSpeechFallbackMessage(message)) showTypeArea();
    micActive = false;
    liveInterim = "";
    pendingSpeech = null;
    if (isFloorHolder(floor, peerId)) void conn?.releaseFloor();
    setState({ ...state, listening: false });
  };

  const onSource = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-lang]");
    if (!btn?.dataset.lang) return;
    const sourceLang = btn.dataset.lang as Lang;
    if (!isLang(sourceLang)) return;
    writeSpokenLang(sourceLang);
    if (sourceLang !== state.sourceLang) liveInterim = "";
    // Chip first. setLang may commit the in-progress draft on this tap, and
    // that final has to file under the language just chosen.
    // Chrome rebuilds the recognizer. iOS reuses the original object and only changes lang.
    setState({ ...state, sourceLang });
    speech.setLang(speechLocale(sourceLang), true);
  };

  const onSwap = () => {
    const next = swapHostLangs(state.sourceLang, state.layout);
    if (!next) return;
    writeSpokenLang(next.spoken);
    liveInterim = "";
    // Same as tapping both chips. iOS reuses the first recognizer and only changes lang.
    setState({ ...state, sourceLang: next.spoken, layout: next.layout });
    speech.setLang(speechLocale(next.spoken), true);
  };

  const onLayout = (event: Event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-layout]");
    if (!btn?.dataset.layout) return;
    setState({ ...state, layout: btn.dataset.layout as Layout });
  };

  const paintSendTv = () => {
    const url = tvUrl(room);
    qrBox.innerHTML = tvQrSvg(url, t("qrTv"));
    urlEl.textContent = plainTvUrl(room);
    langList.innerHTML = LANGS.map((lang) => {
      const langUrl = tvUrl(room, lang);
      return `
        <article class="send-tv-lang">
          <div class="send-tv-lang-qr">${tvQrSvg(langUrl, t("qrLang", { name: LANG_LABEL[lang] }))}</div>
          <div class="send-tv-lang-meta">
            <p class="control-label">${LANG_LABEL[lang]}</p>
            <p class="send-tv-lang-url">${escapeHtml(plainTvUrl(room, lang))}</p>
            <div class="send-tv-lang-actions">
              <button class="secondary" data-copy-lang="${lang}" type="button">${escapeHtml(t("copyLangLink", { lang: LANG_LABEL[lang] }))}</button>
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
    joinRoomCode.textContent = room;
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
    if (next) {
      onCloseSendTv();
      onCloseSettings();
    }
    renderDynamic();
  };

  const onEnterSmartView = () => setSmartViewMode(true);
  const onExitSmartView = () => setSmartViewMode(false);

  const onOpenLocalSetup = () => {
    onCloseSettings();
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
      const restore = t("copyLangLink", { lang: LANG_LABEL[langValue] });
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
    void confirmLeave(screen, "end").then((ok) => {
      if (!ok) return;
      speech.stop();
      releaseWake();
      void conn?.releaseFloor();
      goto("home");
    });
  };

  const onTypeToggle = () => showTypeArea(true);
  const onOpenSettings = () => {
    if (typeof settingsDialog.showModal === "function") settingsDialog.showModal();
    else settingsDialog.setAttribute("open", "");
  };
  const onCloseSettings = () => {
    if (typeof settingsDialog.close === "function" && settingsDialog.open) settingsDialog.close();
    else settingsDialog.removeAttribute("open");
  };
  const onSettingsClick = (event: Event) => {
    if (event.target === settingsDialog) onCloseSettings();
  };
  let closeTour: (() => void) | null = null;
  const onHelp = () => {
    if (closeTour) return;
    closeTour = openTour(screen, () => {
      closeTour = null;
    });
  };
  const onShareTv = async () => {
    const url = tvUrl(room);
    const share = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
    if (typeof share === "function") {
      try {
        await share.call(navigator, { title: t("sendToTv"), url });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    await onCopy();
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
      const input = typeForm.elements.namedItem("caption") as HTMLInputElement;
      const text = input.value.trim();
      if (!text) return;
      if (floorHeldByOther(floor, peerId)) {
        error = floorBusyCopy(connStatus, floor);
        renderDynamic();
        return;
      }
      if (!isFloorHolder(floor, peerId)) {
        const ok = (await conn?.claimFloor(HOST_NAME)) ?? false;
        if (!ok) {
          error = floorBusyCopy(connStatus, floor);
          renderDynamic();
          return;
        }
      }
      input.value = "";
      queuePublish(text, false, langHint);
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
  swapBtn.addEventListener("click", onSwap);
  const unmountMore = mountMoreMenu({
    bar: root.querySelector("[data-more-bar]") as HTMLElement,
    dialogHost: screen,
    form: typeForm,
    input: typeForm.elements.namedItem("caption") as HTMLInputElement,
    lang: () => state.sourceLang,
    translate: (text, from) => translateAll(translator, text, from),
  });
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
  for (const opener of setupOpeners) opener.addEventListener("click", onOpenLocalSetup);
  typeToggle.addEventListener("click", onTypeToggle);
  settingsOpen.addEventListener("click", onOpenSettings);
  settingsClose.addEventListener("click", onCloseSettings);
  settingsDialog.addEventListener("click", onSettingsClick);
  spokenNow.addEventListener("click", onOpenSettings);
  helpBtn.addEventListener("click", onHelp);
  const onShareClick = () => void onShareTv();
  shareTvBtn.addEventListener("click", onShareClick);
  const unbindHaptics = bindHapticsToggle(root);
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
      markMeetingUsed();
      const next = info.floor ?? floor;
      // Reconnected after someone else took the floor while we were away.
      if (state.listening && floorHeldByOther(next, info.peerId)) {
        floor = next;
        publishEpoch += 1;
        pendingSpeech = null;
        stopLocalMic();
        error = someoneElseSpeaking(next);
        setState({ ...state, listening: false }, false);
        return;
      }
      floor = next;
      state = { ...state, floor };
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
        setState({ ...state, listening: false }, false);
        return;
      }
      if (isFloorHolder(next, peerId) && isFloorNotice(error)) error = "";
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
          sourceLang: state.sourceLang,
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
      if (status === "live" && error === RECONNECTING) error = "";
      renderDynamic();
    },
  });
  const unsubTranslate = subscribeTranslateStatus(() => renderDynamic());

  const unbindLang = bindUiLang(root, () => {
    paintLayoutChips();
    renderDynamic();
    paintSendTv();
    paintJoinPhones();
  });
  renderDynamic();

  return () => {
    speech.stop();
    releaseWake();
    conn?.close();
    unsubTranslate();
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
    for (const opener of setupOpeners) opener.removeEventListener("click", onOpenLocalSetup);
    typeToggle.removeEventListener("click", onTypeToggle);
    settingsOpen.removeEventListener("click", onOpenSettings);
    settingsClose.removeEventListener("click", onCloseSettings);
    settingsDialog.removeEventListener("click", onSettingsClick);
    spokenNow.removeEventListener("click", onOpenSettings);
    helpBtn.removeEventListener("click", onHelp);
    shareTvBtn.removeEventListener("click", onShareClick);
    unbindHaptics();
    closeTour?.();
    onCloseSettings();
    setupClose.removeEventListener("click", onCloseLocalSetup);
    setupDialog.removeEventListener("click", onSetupDialogClick);
    onCloseLocalSetup();
    typeForm.removeEventListener("submit", onType);
    langList.removeEventListener("click", onLangActions);
    reclaimBtn.removeEventListener("click", onReclaim);
    swapBtn.removeEventListener("click", onSwap);
    unmountMore();
    joinBtn.removeEventListener("click", onJoinPhones);
    joinDialog.removeEventListener("click", onJoinDialogClick);
    joinDialog.removeEventListener("close", onJoinDialogClose);
    copyJoinBtn.removeEventListener("click", onCopyJoin);
    onCloseJoinPhones();
    onCloseSendTv();
    unbindLang();
  };
}
