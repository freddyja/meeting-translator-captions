import { brandBlock, creditFooter } from "../brand";
import { escapeHtml } from "../dom";
import { bindUiLang, t, uiLangSwitcherHtml, type MessageKey } from "../i18n";
import { mountPhotoPanel, translationRowsHtml } from "../input/photo-panel";
import { mountWritePanel } from "../input/write-panel";
import { goto, type ToolView } from "../router";
import { readSpokenLang } from "../spoken-pref";
import { createHandsFreeTurns, type HandsFreeTurns } from "../stt/hands-free";
import { captionsIn, shownLang } from "../talk-lines";
import { createTalkTranscript } from "../talk-utterances";
import { createWebSpeechProvider, isNonFatalSpeechNote } from "../stt/web-speech";
import { createTranslator, translateAll } from "../translate";
import { LANG_LABEL, LANG_SHORT, LANGS, isLang, speechLocale, type Lang } from "../types";
import { trackSpeech } from "../update/activity";

/**
 * Standalone, no-room tools reached from the front screen's More tools.
 * No room, no QR, no floor. The PIN gate still applies: app.ts gates the page,
 * and translation goes through the same authFetch translator chain.
 */
const TITLE: Record<ToolView, MessageKey> = {
  photo: "toolPhoto",
  write: "toolWrite",
  talk: "toolTalk",
};

function shell(view: ToolView, body: string): string {
  return `
    <section class="screen tool-screen entry-scene scene-bg" data-tool="${view}">
      <div class="tool-top">
        <button class="ghost tool-back" data-tool-home type="button" data-i18n="toolHome"></button>
        ${uiLangSwitcherHtml(true)}
      </div>
      ${brandBlock(true)}
      <h1 class="tool-title" data-i18n="${TITLE[view]}"></h1>
      <div class="tool-card">${body}</div>
      ${creditFooter()}
    </section>
  `;
}

function langChips(attr: string, selected: Lang, compact = false): string {
  return LANGS.map(
    (lang) =>
      `<button class="chip${lang === selected ? " active" : ""}${compact ? " chip-compact" : ""}" type="button" ${attr}="${lang}" aria-pressed="${lang === selected}">${LANG_LABEL[lang]}</button>`,
  ).join("");
}

function paintChips(box: HTMLElement, attr: string, selected: Lang) {
  for (const btn of box.querySelectorAll<HTMLButtonElement>(`[${attr}]`)) {
    const on = btn.getAttribute(attr) === selected;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  }
}

function bindHome(root: HTMLElement): () => void {
  const btn = root.querySelector("[data-tool-home]") as HTMLButtonElement;
  const onHome = () => goto("home");
  btn.addEventListener("click", onHome);
  return () => btn.removeEventListener("click", onHome);
}

export function mountTool(root: HTMLElement, view: ToolView): () => void {
  if (view === "photo") return mountPhotoTool(root);
  if (view === "write") return mountWriteTool(root);
  return mountTalkTool(root);
}

// ---------- Photo translate ----------
function mountPhotoTool(root: HTMLElement): () => void {
  const translator = createTranslator();
  root.innerHTML = shell("photo", `<div data-photo-host></div>`);
  const panel = mountPhotoPanel(root.querySelector("[data-photo-host]") as HTMLElement, {
    lang: readSpokenLang,
    translate: (text, from) => translateAll(translator, text, from),
  });
  const unbindHome = bindHome(root);
  const unbindLang = bindUiLang(root, () => panel.repaint());
  return () => {
    panel.destroy();
    unbindHome();
    unbindLang();
  };
}

// ---------- Write & translate ----------
function mountWriteTool(root: HTMLElement): () => void {
  const translator = createTranslator();
  let lang: Lang = readSpokenLang();
  root.innerHTML = shell(
    "write",
    `
      <p class="control-label" data-i18n="writeLang"></p>
      <div class="chips" data-write-lang role="group" data-i18n-aria="writeLang">${langChips("data-write-lang-id", lang)}</div>
      <div data-write-host></div>
      <p class="control-label" data-i18n="photoTextFound"></p>
      <textarea class="photo-text" data-write-text rows="2"></textarea>
      <div class="row-actions">
        <button class="primary" data-write-translate type="button" data-i18n="retranslate"></button>
      </div>
      <div class="photo-translations" data-write-out></div>
    `,
  );
  const langBox = root.querySelector("[data-write-lang]") as HTMLElement;
  const textBox = root.querySelector("[data-write-text]") as HTMLTextAreaElement;
  const out = root.querySelector("[data-write-out]") as HTMLElement;
  let token = 0;
  const translateNow = async () => {
    const text = textBox.value.trim();
    if (!text) return;
    const mine = ++token;
    out.innerHTML = `<p class="hint">${escapeHtml(t("translatingEllipsis"))}</p>`;
    try {
      const rows = await translateAll(translator, text, lang);
      if (mine === token) out.innerHTML = translationRowsHtml(rows);
    } catch {
      if (mine === token) out.innerHTML = "";
    }
  };
  // The pad's one Clear also empties the text and the translations.
  const onReset = () => {
    token += 1;
    textBox.value = "";
    out.innerHTML = "";
  };
  const panel = mountWritePanel(root.querySelector("[data-write-host]") as HTMLElement, {
    lang: () => lang,
    onText: (text) => {
      textBox.value = textBox.value.trim() ? `${textBox.value.trim()} ${text}` : text;
      void translateNow();
    },
    onClear: onReset,
  });
  const onLang = (event: Event) => {
    const next = (event.target as HTMLElement).closest<HTMLElement>("[data-write-lang-id]")?.dataset.writeLangId;
    if (!isLang(next)) return;
    lang = next;
    paintChips(langBox, "data-write-lang-id", lang);
    panel.redraw();
  };
  const onTranslate = () => void translateNow();
  const translateBtn = root.querySelector("[data-write-translate]") as HTMLButtonElement;
  langBox.addEventListener("click", onLang);
  translateBtn.addEventListener("click", onTranslate);
  const onResize = () => panel.redraw();
  window.addEventListener("resize", onResize);
  const unbindHome = bindHome(root);
  const unbindLang = bindUiLang(root, () => panel.redraw());
  requestAnimationFrame(() => panel.redraw());
  return () => {
    langBox.removeEventListener("click", onLang);
    translateBtn.removeEventListener("click", onTranslate);
    window.removeEventListener("resize", onResize);
    panel.destroy();
    unbindHome();
    unbindLang();
  };
}

// ---------- Two-person conversation ----------

function mountTalkTool(root: HTMLElement): () => void {
  const translator = createTranslator();
  const speech = trackSpeech(createWebSpeechProvider());
  let langA: Lang = readSpokenLang();
  let langB: Lang = langA === "en" ? "es" : "en";
  let turns: HandsFreeTurns | null = null;
  let error = "";
  let wakeLock: WakeLockSentinel | null = null;

  root.innerHTML = shell(
    "talk",
    `
      <div class="talk-pick">
        <div class="talk-person">
          <p class="talk-person-label" data-i18n="talkLangA"></p>
          <div class="chips talk-chips" data-talk-a>${langChips("data-talk-lang", langA, true)}</div>
        </div>
        <div class="talk-person">
          <p class="talk-person-label" data-i18n="talkLangB"></p>
          <div class="chips talk-chips" data-talk-b>${langChips("data-talk-lang", langB, true)}</div>
        </div>
      </div>
      <p class="hint talk-hint" data-talk-hint data-i18n="talkHint"></p>
      <div class="talk-controls">
        <button class="chip talk-who-btn" data-talk-who-lang="a" type="button" hidden></button>
        <button class="primary talk-start" data-talk-start type="button"></button>
        <button class="chip talk-who-btn" data-talk-who-lang="b" type="button" hidden></button>
      </div>
      <p class="hint talk-status" data-talk-status role="status" aria-live="polite"></p>
      <div class="talk-log" data-talk-log aria-live="polite"></div>
      <div class="talk-foot">
        <button class="ghost talk-expand-btn" data-talk-expand="a" type="button"></button>
        <button class="ghost talk-expand-btn" data-talk-expand="b" type="button"></button>
        <button class="ghost" data-talk-clear type="button" data-i18n="talkClear"></button>
      </div>
      <div class="talk-full" data-talk-full hidden role="dialog" aria-modal="true" aria-labelledby="talk-full-title">
        <header class="talk-full-head">
          <h2 class="talk-full-title" id="talk-full-title" data-talk-full-title></h2>
          <span class="talk-full-status" data-talk-full-status></span>
          <button class="secondary talk-full-back" data-talk-full-back type="button" data-i18n="talkBack"></button>
        </header>
        <div class="talk-full-log" data-talk-full-log aria-live="polite"></div>
      </div>
    `,
  );
  const aBox = root.querySelector("[data-talk-a]") as HTMLElement;
  const bBox = root.querySelector("[data-talk-b]") as HTMLElement;
  const startBtn = root.querySelector("[data-talk-start]") as HTMLButtonElement;
  const whoBox = root.querySelector(".talk-controls") as HTMLElement;
  const hintEl = root.querySelector("[data-talk-hint]") as HTMLElement;
  const foot = root.querySelector(".talk-foot") as HTMLElement;
  const full = root.querySelector("[data-talk-full]") as HTMLElement;
  const fullTitle = root.querySelector("[data-talk-full-title]") as HTMLElement;
  const fullStatus = root.querySelector("[data-talk-full-status]") as HTMLElement;
  const fullLog = root.querySelector("[data-talk-full-log]") as HTMLElement;
  const fullBack = root.querySelector("[data-talk-full-back]") as HTMLButtonElement;
  /** Language shown full screen, or null for the split view. */
  let expanded: Lang | null = null;
  const screenEl = root.querySelector("[data-tool]") as HTMLElement;
  // Outside the blurred card: backdrop-filter would trap position:fixed inside it.
  screenEl.append(full);
  const statusEl = root.querySelector("[data-talk-status]") as HTMLElement;
  const log = root.querySelector("[data-talk-log]") as HTMLElement;
  // One bubble per utterance (page-owned id), updated in place with its translation.
  const transcript = createTalkTranscript({
    translate: (text, from) => translateAll(translator, text, from),
    onChange: () => render(),
  });
  const lines = transcript.lines;

  const render = () => {
    paintChips(aBox, "data-talk-lang", langA);
    paintChips(bBox, "data-talk-lang", langB);
    const on = Boolean(turns);
    startBtn.textContent = on ? t("talkStop") : t("talkStart");
    startBtn.classList.toggle("hot", on);
    startBtn.setAttribute("aria-pressed", String(on));
    hintEl.hidden = on || lines.length > 0;
    for (const btn of whoBox.querySelectorAll<HTMLButtonElement>("[data-talk-who-lang]")) {
      const lang = btn.dataset.talkWhoLang === "a" ? langA : langB;
      btn.hidden = !on;
      btn.textContent = `🎤 ${LANG_LABEL[lang]}`;
      btn.setAttribute("aria-label", t("talkListening", { lang: LANG_LABEL[lang] }));
      const active = turns?.listening === lang;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    const status = error
      ? error
      : !speech.supported
        ? t("talkNoSpeech")
        : turns
          ? t("talkListening", { lang: LANG_LABEL[turns.listening] })
          : "";
    statusEl.textContent = status;
    const pair: [Lang, Lang] = [langA, langB];
    const items = lines.map((line) => {
      const to = shownLang(line, pair);
      const side = line.lang === langA ? "a" : "b";
      const big = line.rows ? line.rows[to] : t("translatingEllipsis");
      const label = t("talkExpand", { lang: LANG_LABEL[to] });
      // The bubble expands its language. Speaker correction stays on the 🎤 buttons only.
      return `
        <button class="talk-line talk-${side}${line.live ? " is-live" : ""}" type="button" data-talk-line-id="${line.id}" lang="${to}" data-talk-line-lang="${to}" aria-label="${escapeHtml(label)}">
          <span class="talk-expand-icon" aria-hidden="true">⤢</span>
          <span class="talk-big">${escapeHtml(big)}</span>
          <span class="talk-orig"><span class="talk-code">${LANG_SHORT[line.lang]}</span> ${escapeHtml(line.original)}</span>
        </button>`;
    });
    log.innerHTML = items.join("") || `<p class="hint talk-empty">${escapeHtml(t("talkEmpty"))}</p>`;
    log.scrollTop = log.scrollHeight;
    for (const btn of foot.querySelectorAll<HTMLButtonElement>("[data-talk-expand]")) {
      const lang = btn.dataset.talkExpand === "a" ? langA : langB;
      btn.textContent = `⤢ ${LANG_LABEL[lang]}`;
      btn.setAttribute("aria-label", t("talkExpand", { lang: LANG_LABEL[lang] }));
      btn.hidden = lines.length === 0;
    }
    // Full screen: one language, live, large.
    full.hidden = expanded === null;
    screenEl.classList.toggle("talk-expanded", expanded !== null);
    if (expanded) {
      fullTitle.textContent = LANG_LABEL[expanded];
      fullStatus.textContent = status;
      const rows = captionsIn(lines, expanded).map(
        (row) =>
          `<p class="talk-full-line${row.spoken ? " is-spoken" : ""}" lang="${expanded}">${escapeHtml(row.text ?? t("translatingEllipsis"))}</p>`,
      );
      fullLog.innerHTML = rows.join("") || `<p class="hint">${escapeHtml(t("talkEmpty"))}</p>`;
      fullLog.scrollTop = fullLog.scrollHeight;
    }
  };

  const listen = (lang: Lang) => {
    // iPhone: the first recognizer is reused and only its lang changes.
    speech.setLang(speechLocale(lang), true);
  };

  const stop = () => {
    turns?.stop();
    turns = null;
    transcript.close();
    speech.stop();
    void wakeLock?.release();
    wakeLock = null;
  };

  const start = () => {
    error = "";
    if (langA === langB) {
      error = t("talkSameLang");
      render();
      return;
    }
    turns = createHandsFreeTurns({
      pair: [langA, langB],
      listening: langA,
      onTurnEnd: (next) => {
        // Close the bubble before the flip: iOS commits its draft as the locale changes.
        transcript.close();
        listen(next);
        render();
      },
    });
    // start() on the tap stack: iOS rejects recognition.start() after an await.
    listen(langA);
    speech.start();
    void navigator.wakeLock
      ?.request("screen")
      .then((lock) => (wakeLock = lock))
      .catch(() => undefined);
    render();
  };

  speech.onResult = (result) => {
    if (!turns) return;
    error = "";
    const text = result.text.trim();
    if (!result.isFinal) {
      // Still talking: hold the turn open. Interims grow the open bubble in place.
      turns.heard(text, false);
      if (text) transcript.heard(text, false, turns.listening);
      else render();
      return;
    }
    const update = transcript.heard(text, true, turns.listening);
    if (!update) return render();
    // A late repeat of a bubble whose turn already ended: text only, no turn-taking.
    if (update.reemit) return;
    const lang = turns.heard(update.utterance.text, true);
    if (!lang) return render();
    if (lang !== turns.listening) {
      // The words were clearly the other person's language: follow them.
      turns.listenIn(lang);
      turns.heard(update.utterance.text, true);
      transcript.refile(update.utterance.id, lang);
      listen(lang);
    } else if (lang !== update.utterance.lang) {
      transcript.refile(update.utterance.id, lang);
    }
    render();
  };
  speech.onError = (message) => {
    error = message;
    if (!isNonFatalSpeechNote(message)) stop();
    render();
  };

  const onPick = (which: "a" | "b") => (event: Event) => {
    const next = (event.target as HTMLElement).closest<HTMLElement>("[data-talk-lang]")?.dataset.talkLang;
    if (!isLang(next)) return;
    if (which === "a") langA = next;
    else langB = next;
    if (turns) {
      // New pair: restart turn-taking on the same recognizer.
      stop();
      start();
      return;
    }
    error = "";
    render();
  };
  const onPickA = onPick("a");
  const onPickB = onPick("b");
  const onStart = () => (turns ? (stop(), render()) : start());
  const onWho = (event: Event) => {
    const which = (event.target as HTMLElement).closest<HTMLElement>("[data-talk-who-lang]")?.dataset.talkWhoLang;
    if (!turns || (which !== "a" && which !== "b")) return;
    const lang = which === "a" ? langA : langB;
    // Speaker change: the next words start a new bubble.
    transcript.close();
    turns.listenIn(lang);
    listen(lang);
    render();
  };
  const expand = (lang: Lang) => {
    expanded = lang;
    render();
    fullBack.focus();
  };
  const collapse = () => {
    expanded = null;
    render();
  };
  const onLogTap = (event: Event) => {
    const lang = (event.target as HTMLElement).closest<HTMLElement>("[data-talk-line-lang]")?.dataset.talkLineLang;
    if (isLang(lang)) expand(lang);
  };
  const onFootTap = (event: Event) => {
    const which = (event.target as HTMLElement).closest<HTMLElement>("[data-talk-expand]")?.dataset.talkExpand;
    if (which === "a") expand(langA);
    else if (which === "b") expand(langB);
  };
  /** A tap anywhere on the full-screen captions (or Back, or Escape) returns to the split view. */
  const onFullTap = () => collapse();
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && expanded) collapse();
  };
  const onClear = () => {
    transcript.clear();
  };
  const clearBtn = root.querySelector("[data-talk-clear]") as HTMLButtonElement;
  aBox.addEventListener("click", onPickA);
  bBox.addEventListener("click", onPickB);
  startBtn.addEventListener("click", onStart);
  whoBox.addEventListener("click", onWho);
  clearBtn.addEventListener("click", onClear);
  log.addEventListener("click", onLogTap);
  foot.addEventListener("click", onFootTap);
  full.addEventListener("click", onFullTap);
  document.addEventListener("keydown", onKey);
  const unbindHome = bindHome(root);
  const unbindLang = bindUiLang(root, render);
  render();

  return () => {
    stop();
    transcript.destroy();
    aBox.removeEventListener("click", onPickA);
    bBox.removeEventListener("click", onPickB);
    startBtn.removeEventListener("click", onStart);
    whoBox.removeEventListener("click", onWho);
    clearBtn.removeEventListener("click", onClear);
    log.removeEventListener("click", onLogTap);
    foot.removeEventListener("click", onFootTap);
    full.removeEventListener("click", onFullTap);
    document.removeEventListener("keydown", onKey);
    unbindHome();
    unbindLang();
  };
}
