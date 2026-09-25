import {
  canonicalRole,
  displayCopy,
  displaySpeaker,
  getUiLang,
  setUiLang,
  t,
  UI_LANG_STORAGE_KEY,
  uiLangFromTags,
  uiLangSwitcherHtml,
  watchChipsHtml,
} from "../src/i18n.ts";
import { joinSearch, parseRoute, parseTvLang, tvSearch } from "../src/router.ts";
import { detectSpeechCapability, isAppleMobile } from "../src/stt/capability.ts";
import { createWebSpeechProvider, localeRejectedMessage } from "../src/stt/web-speech.ts";
import { renderCaptionBoard } from "../src/views/caption-board.ts";
import { captionSpeakerName, isWatchLang, keepsLocalCaptions, langsForLayout, langsForWatch, lostFloor, reconcileFloor, speechLocale } from "../src/types.ts";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function same(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
}

assert(parseTvLang("en") === "en", "parseTvLang en");
assert(parseTvLang("ES") === "es", "parseTvLang is case-insensitive");
assert(parseTvLang(" pt ") === "pt", "parseTvLang trims");
assert(parseTvLang("fr") === undefined, "parseTvLang ignores unknown");
assert(parseTvLang("en-es") === undefined, "parseTvLang ignores layout ids");
assert(parseTvLang("") === undefined, "parseTvLang empty");
assert(parseTvLang(null) === undefined, "parseTvLang null");

same(parseRoute(""), { view: "home", room: "" }, "empty search is home");
same(parseRoute("?view=tv&room=ABCD"), { view: "tv", room: "ABCD" }, "TV without lang omits lang");
same(
  parseRoute("?view=tv&room=abcd&lang=es"),
  { view: "tv", room: "ABCD", lang: "es" },
  "TV lang=es is a local override",
);
same(
  parseRoute("view=tv&room=ABCD&lang=PT"),
  { view: "tv", room: "ABCD", lang: "pt" },
  "TV lang is case-insensitive",
);
same(
  parseRoute("?view=tv&room=ABCD&lang=fr"),
  { view: "tv", room: "ABCD" },
  "unknown lang= does not lock a language",
);
same(
  parseRoute("?view=phone&room=ABCD&lang=es"),
  { view: "phone", room: "ABCD", role: "host" },
  "lang= on phone is ignored",
);
same(parseRoute("?lang=es"), { view: "home", room: "" }, "lang= without TV view is ignored");
same(
  parseRoute("?view=join&room=abcd"),
  { view: "join", room: "ABCD", role: "guest" },
  "join view is a guest phone",
);
same(
  parseRoute("?view=phone&room=ABCD&role=guest"),
  { view: "phone", room: "ABCD", role: "guest" },
  "phone role=guest is the guest join path",
);
same(
  parseRoute("?view=phone&room=ABCD"),
  { view: "phone", room: "ABCD", role: "host" },
  "phone without role stays the host Fold",
);

assert(tvSearch("ABCD") === "view=tv&room=ABCD", "combined TV query has no lang");
assert(tvSearch("ABCD", "es") === "view=tv&room=ABCD&lang=es", "per-language TV query");
assert(tvSearch("ABCD", "en") === "view=tv&room=ABCD&lang=en", "en TV query");
assert(tvSearch("ABCD", "pt") === "view=tv&room=ABCD&lang=pt", "pt TV query");
assert(joinSearch("ABCD") === "view=join&room=ABCD", "guest join query");

same(langsForLayout("en-es-pt"), ["en", "es", "pt"], "room layout all three unchanged");
same(langsForLayout("es"), ["es"], "room layout es unchanged");
same(langsForWatch("all"), ["en", "es", "pt"], "watch all is the three-pane board");
same(langsForWatch("en"), ["en"], "watch en is one pane");
same(langsForWatch("es"), ["es"], "watch es is one pane");
same(langsForWatch("pt"), ["pt"], "watch pt is one pane");
assert(isWatchLang("all") && isWatchLang("en") && isWatchLang("es") && isWatchLang("pt"), "watch accepts en es pt all");
assert(!isWatchLang("en-es") && !isWatchLang("fr") && !isWatchLang(""), "watch rejects room layouts and blanks");

assert(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5), "iPhone UA is Apple mobile");
assert(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120.0.0.0", "iPhone", 5), "iPhone Chrome is still Apple mobile");
assert(!isAppleMobile("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0 Mobile", "Linux armv8l", 5), "Android is not Apple mobile");

const iphoneNoStt = detectSpeechCapability({
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  platform: "iPhone",
  maxTouchPoints: 5,
  secureContext: true,
  hasSpeechCtor: false,
});
assert(iphoneNoStt.canListen === false && iphoneNoStt.preferType === true, "iPhone without Web Speech types captions");

const iphoneWithStt = detectSpeechCapability({
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  platform: "iPhone",
  maxTouchPoints: 5,
  secureContext: true,
  hasSpeechCtor: true,
});
assert(iphoneWithStt.canListen === true && iphoneWithStt.preferType === true, "iPhone with Web Speech still prefers type fallback");

const androidChrome = detectSpeechCapability({
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0 Mobile",
  platform: "Linux armv8l",
  maxTouchPoints: 5,
  secureContext: true,
  hasSpeechCtor: true,
});
assert(androidChrome.canListen === true && androidChrome.preferType === false, "Android Chrome uses live speech");

const httpLan = detectSpeechCapability({
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile",
  secureContext: false,
  hasSpeechCtor: true,
});
assert(httpLan.canListen === false && httpLan.insecure === true && httpLan.preferType === true, "HTTP LAN cannot use the mic");

const hostFloor = { holderId: "host", holderName: "Host" };
const guestFloor = { holderId: "guest", holderName: "Guest" };
const emptyFloor = { holderId: null, holderName: null };
assert(keepsLocalCaptions(hostFloor, guestFloor, "host") === false, "guest holder replaces a stale host floor");
assert(keepsLocalCaptions(hostFloor, emptyFloor, "host") === true, "empty snapshot does not steal lines from the holder");
assert(keepsLocalCaptions(emptyFloor, guestFloor, "host") === false, "host applies a guest caption");
assert(reconcileFloor(hostFloor, guestFloor, "host").holderId === "guest", "incoming guest floor wins");
assert(reconcileFloor(hostFloor, emptyFloor, "host").holderId === "host", "stale empty floor keeps the local holder");
assert(lostFloor(guestFloor, hostFloor, "guest") === true, "another holder takes the floor");
assert(lostFloor(guestFloor, emptyFloor, "guest") === false, "our own Stop is not someone else speaking");
assert(lostFloor(emptyFloor, emptyFloor, "guest") === false, "watching a release is not losing the mic");

assert(captionSpeakerName("", "Host") === "Host", "empty host name falls back to Host");
assert(captionSpeakerName("   ", "Guest") === "Guest", "empty guest name falls back to Guest");
assert(captionSpeakerName("  Ada  ", "Guest") === "Ada", "guest display name is kept on the caption");

const adaLine = {
  id: "1",
  isFinal: true,
  at: 1,
  speaker: "Ada",
  text: { en: "Hello", es: "Hola", pt: "Olá" },
};
const adaBoard = renderCaptionBoard({
  layout: "en-es-pt",
  lines: [adaLine],
  floor: { holderId: "guest", holderName: "Ada" },
  listening: true,
});
assert(adaBoard.shown.join(",") === "en,es,pt", "speaker labels render in every language window");
for (const lang of ["en", "es", "pt"]) {
  assert(adaBoard.html.includes(`data-lang="${lang}"`), `${lang} window is present`);
}
assert((adaBoard.html.match(/class="line-speaker">Ada/g) || []).length === 3, "Ada is labeled on EN, ES, and PT");
const repeatBoard = renderCaptionBoard(
  {
    layout: "en",
    lines: [
      adaLine,
      { ...adaLine, id: "2", text: { en: "Again", es: "Otra", pt: "De novo" } },
    ],
  },
  null,
  ["en"],
);
assert((repeatBoard.html.match(/class="line-speaker">Ada/g) || []).length === 2, "each caption line keeps the speaker name");
assert(!adaBoard.html.includes("Listening…"), "same speaker does not add a second listening row");

const watchBoard = renderCaptionBoard(
  {
    layout: "en-es-pt",
    lines: [adaLine],
    floor: { holderId: "host", holderName: "Host" },
    listening: true,
  },
  null,
  ["es"],
);
assert(watchBoard.shown.join(",") === "es", "Watch single pane stays one language");
assert(watchBoard.html.includes('class="line-speaker">Ada'), "Watch pane keeps who said the caption");
assert(watchBoard.html.includes('class="line-speaker">Host'), "floor change shows the new speaker on Watch");
assert(watchBoard.html.includes("Listening…"), "new floor holder is marked as the active speaker");

const blankBoard = renderCaptionBoard(
  {
    layout: "en",
    lines: [{ id: "2", isFinal: true, at: 2, speaker: "   ", text: { en: "Hello", es: "Hola", pt: "Olá" } }],
  },
  null,
  ["en"],
);
assert(!blankBoard.html.includes("line-speaker"), "empty speaker does not render a blank label");

const liveBoard = renderCaptionBoard(
  { layout: "en-es-pt", lines: [], listening: true, floor: { holderId: "guest", holderName: "Ada" } },
  { text: "hello", sourceLang: "en", speaker: "Ada" },
);
assert((liveBoard.html.match(/class="line-speaker">Ada/g) || []).length === 3, "interim captions name the speaker in each window");
assert(liveBoard.html.includes("hello"), "spoken draft stays on the source pane");

assert(speechLocale("en") === "en-US", "English recognizer locale");
assert(speechLocale("es") === "es-ES", "Spanish recognizer locale");
assert(speechLocale("pt") === "pt-BR", "Brazilian Portuguese recognizer locale");

function createRecognitionWorld({ stickyFirstInstance, rejectLocales = [] }) {
  let firstEngine = null;
  let serial = 0;
  const instances = [];
  class Rec {
    constructor() {
      this.lang = "";
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 1;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.running = false;
      this.engineLang = "";
      this.serial = serial;
      this.pageLangAtBirth = globalThis.document?.documentElement?.lang ?? "";
      serial += 1;
      instances.push(this);
    }
    start() {
      if (this.running) {
        const err = new Error("recognition has already started.");
        err.name = "InvalidStateError";
        throw err;
      }
      const requested = this.lang || "en-US";
      if (stickyFirstInstance) {
        if (firstEngine == null) firstEngine = requested;
        // iOS: a second SpeechRecognition keeps the first session's language.
        this.engineLang = this.serial === 0 ? requested : firstEngine;
      } else {
        this.engineLang = requested;
      }
      this.running = true;
      if (rejectLocales.includes(requested)) {
        this.running = false;
        queueMicrotask(() => {
          this.onerror?.({ error: "language-not-supported" });
          this.onend?.();
        });
      }
    }
    abort() {
      if (!this.running) return;
      this.running = false;
      queueMicrotask(() => {
        this.onerror?.({ error: "aborted" });
        this.onend?.();
      });
    }
    stop() {
      this.abort();
    }
    /** Returns "final" only when the live engine locale matches the spoken locale. */
    emit(spokenLocale, text) {
      if (!this.running) return "idle";
      if (spokenLocale !== this.engineLang) {
        this.running = false;
        this.onerror?.({ error: "no-speech" });
        this.onend?.();
        return "no-speech";
      }
      this.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: text } }],
      });
      if (!this.continuous) {
        this.running = false;
        this.onend?.();
      }
      return "final";
    }
    /** iOS-style draft: words on device, isFinal withheld. */
    emitPartial(spokenLocale, text) {
      if (!this.running) return "idle";
      if (spokenLocale !== this.engineLang) {
        this.running = false;
        this.onerror?.({ error: "no-speech" });
        this.onend?.();
        return "no-speech";
      }
      this.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: text } }],
      });
      return "interim";
    }
    finish() {
      if (!this.running) return "idle";
      this.running = false;
      this.onend?.();
      return "end";
    }
    /** Safari can end a heard phrase with no-speech and skip onend. */
    noSpeech({ end = true } = {}) {
      if (!this.running) return "idle";
      this.running = false;
      this.onerror?.({ error: "no-speech" });
      if (end) this.onend?.();
      return "no-speech";
    }
  }
  return {
    Rec,
    instances,
    active() {
      return instances.filter((item) => item.running);
    },
  };
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function harness(world, appleMobile, extra = {}) {
  const finals = [];
  const errors = [];
  const speech = createWebSpeechProvider({
    appleMobile,
    recognitionCtor: world.Rec,
    scheduleRestart: (run) => queueMicrotask(run),
    scheduleWatchdog: () => {},
    ...extra,
  });
  speech.onResult = (result) => {
    if (result.isFinal) finals.push(result.text);
  };
  speech.onError = (message) => errors.push(message);
  return { speech, finals, errors };
}

const iphone = createRecognitionWorld({ stickyFirstInstance: true });
const iphoneSpeech = harness(iphone, true);
iphoneSpeech.speech.setLang(speechLocale("en"));
iphoneSpeech.speech.start();
await flush();
assert(iphone.active()[0]?.engineLang === "en-US", "iPhone English session uses en-US");
assert(iphone.active()[0].emit("en-US", "Welcome everyone") === "final", "English final publishes");
// Switch in the one-shot gap, before the English restart, the way a chip tap lands
// after the first utterance has already ended.
iphoneSpeech.speech.setLang(speechLocale("es"));
await flush();
assert(iphone.instances.length === 1, "iPhone keeps the original recognizer");
assert(iphone.active().length === 1, "Spanish session is running after the switch");
assert(iphone.active()[0].engineLang === "es-ES", `Spanish switch left engine on ${iphone.active()[0]?.engineLang}`);
assert(iphone.active()[0].emit("es-ES", "Buenas noches a todos") === "final", "Spanish final publishes");
iphoneSpeech.speech.setLang(speechLocale("pt"));
await flush();
assert(iphone.instances.length === 1, "Portuguese switch still uses the original recognizer");
assert(iphone.active()[0]?.engineLang === "pt-BR", `Portuguese switch left engine on ${iphone.active()[0]?.engineLang}`);
assert(iphone.active()[0].emit("pt-BR", "Boa noite a todos") === "final", "Portuguese final publishes");
await flush();
assert(
  iphoneSpeech.finals.join("|") === "Welcome everyone|Buenas noches a todos|Boa noite a todos",
  `iPhone EN → ES → PT finals: ${iphoneSpeech.finals.join("|")}`,
);
assert(iphoneSpeech.errors.length === 0, `iPhone switch raised ${iphoneSpeech.errors.join(" | ")}`);

iphoneSpeech.speech.stop();
await flush();
iphoneSpeech.speech.setLang(speechLocale("es"));
iphoneSpeech.speech.start();
await flush();
assert(iphone.active()[0]?.engineLang === "es-ES", "Start after Stop still uses es-ES on the same object");
assert(iphone.instances.length === 1, "Stop did not construct a second iPhone recognizer");

async function withPageLang(lang, run) {
  const previous = globalThis.document;
  const page = { documentElement: { lang } };
  globalThis.document = page;
  try {
    return await run(page);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

await withPageLang("en", async (page) => {
  const primed = createRecognitionWorld({ stickyFirstInstance: true });
  const primedSpeech = harness(primed, true);
  primedSpeech.speech.setLang(speechLocale("es"));
  assert(primed.instances.length === 0, "idle setLang does not construct a recognizer before Spoken is primed");
  assert(page.documentElement.lang === "es-ES", "idle Spanish setLang updates the page language before construction");
  primedSpeech.speech.setLang(speechLocale("es"), true);
  assert(primed.instances.length === 1, "Join Spoken=ES creates the single iOS recognizer");
  assert(primed.instances[0].lang === "es-ES", "Join Spoken=ES sets es-ES before start");
  assert(primed.instances[0].pageLangAtBirth === "es-ES", "Spanish recognizer is born after the page language is es-ES");
  assert(primed.active().length === 0, "priming Spoken does not start the mic");
  primedSpeech.speech.setLang(speechLocale("es"), true);
  assert(primed.instances.length === 1, "priming Spanish again keeps the same recognizer");
  primedSpeech.speech.start();
  await flush();
  assert(primed.active()[0]?.engineLang === "es-ES", "first start uses the Spoken es-ES already on the recognizer");
  assert(primed.instances.length === 1, "start does not build a second iOS recognizer after prime");
  assert(primed.active()[0].emit("es-ES", "Buenas noches a todos") === "final", "primed Spanish final publishes");
  primedSpeech.speech.stop();
  await flush();
  primedSpeech.speech.setLang(speechLocale("pt"), true);
  assert(primed.instances.length === 1, "Spoken=PT reuses the original recognizer while idle");
  assert(primed.instances[0].lang === "pt-BR", "Spoken=PT writes pt-BR before the next start");
  assert(page.documentElement.lang === "pt-BR", "idle Portuguese prime updates the page language");
  assert(primed.active().length === 0, "idle Portuguese prime does not start the mic");
  primedSpeech.speech.start();
  await flush();
  assert(primed.active()[0]?.engineLang === "pt-BR", "start after idle PT prime uses pt-BR");
  assert(primed.active()[0].emit("pt-BR", "Boa noite a todos") === "final", "primed Portuguese final publishes");
  primedSpeech.speech.stop();
  await flush();
  primedSpeech.speech.setLang(speechLocale("en"), true);
  assert(primed.instances[0].lang === "en-US", "Spoken=EN writes en-US on the same object before start");
  primedSpeech.speech.start();
  await flush();
  assert(primed.instances.length === 1, "English after ES and PT still uses the original recognizer");
  assert(primed.active()[0]?.engineLang === "en-US", "Spoken=EN still starts en-US on the same object");
  assert(primed.active()[0].emit("en-US", "Welcome everyone") === "final", "English still publishes after ES and PT");
  assert(primedSpeech.errors.length === 0, `primed Spoken switch raised ${primedSpeech.errors.join(" | ")}`);
});

await withPageLang("en", async (page) => {
  const late = createRecognitionWorld({ stickyFirstInstance: true });
  const lateSpeech = harness(late, true);
  lateSpeech.speech.setLang(speechLocale("en"), true);
  lateSpeech.speech.start();
  await flush();
  assert(late.active()[0].emit("en-US", "Welcome everyone") === "final", "English session before an idle Spanish switch");
  lateSpeech.speech.stop();
  await flush();
  lateSpeech.speech.setLang(speechLocale("es"), true);
  assert(late.instances.length === 1, "idle EN → ES does not build a second recognizer");
  assert(late.instances[0].lang === "es-ES", "idle EN → ES writes es-ES before the next start");
  assert(page.documentElement.lang === "es-ES", "idle EN → ES updates the page language");
  lateSpeech.speech.start();
  await flush();
  assert(late.active()[0]?.engineLang === "es-ES", "start after idle EN → ES uses es-ES");
  assert(late.active()[0].emit("es-ES", "Buenas noches a todos") === "final", "Spanish after an English session publishes");
});

await withPageLang("en", (page) => {
  const chromePage = createRecognitionWorld({ stickyFirstInstance: false });
  const chromePageSpeech = harness(chromePage, false);
  chromePageSpeech.speech.setLang("es-ES", true);
  assert(page.documentElement.lang === "en", "Chrome does not retarget the page language");
  assert(chromePage.instances.length === 0, "Chrome prime does not construct the iOS singleton");
});

{
  const made = [];
  let webkitInst = null;
  class Webkit {
    constructor() {
      made.push("webkit");
      webkitInst = this;
      this.lang = "";
    }
    start() {}
    stop() {}
    abort() {}
  }
  class Standard {
    constructor() {
      made.push("standard");
      this.lang = "";
    }
    start() {}
    stop() {}
    abort() {}
  }
  const previousWindow = globalThis.window;
  globalThis.window = { SpeechRecognition: Standard, webkitSpeechRecognition: Webkit };
  try {
    const iphoneCtor = createWebSpeechProvider({
      appleMobile: true,
      scheduleRestart: () => {},
      scheduleWatchdog: () => {},
      scheduleCommit: () => {},
    });
    iphoneCtor.setLang("es-ES", true);
    assert(made.join(",") === "webkit", `iPhone prime used ${made.join(",") || "nothing"}`);
    assert(webkitInst.lang === "es-ES", "webkit recognizer receives es-ES before start");
    iphoneCtor.setLang("pt-BR", true);
    assert(made.length === 1, "pt-BR prime keeps the first webkitSpeechRecognition");
    assert(webkitInst.lang === "pt-BR", "same webkit recognizer receives pt-BR");
    made.length = 0;
    const chromeCtor = createWebSpeechProvider({
      appleMobile: false,
      scheduleRestart: () => {},
      scheduleWatchdog: () => {},
      scheduleCommit: () => {},
    });
    chromeCtor.setLang("es-ES", true);
    chromeCtor.start();
    assert(made.join(",") === "standard", `Chrome start used ${made.join(",") || "nothing"}`);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

const liveSwitch = createRecognitionWorld({ stickyFirstInstance: true });
const liveSpeech = harness(liveSwitch, true);
liveSpeech.speech.start();
await flush();
assert(liveSwitch.active()[0]?.engineLang === "en-US", "live English session before the chip tap");
liveSpeech.speech.setLang("es-ES");
await flush();
assert(liveSwitch.instances.length === 1, "live Spanish switch does not build a second recognizer");
assert(liveSwitch.active().length === 1, "live Spanish switch restarts the mic");
assert(liveSwitch.active()[0].engineLang === "es-ES", `live switch left engine on ${liveSwitch.active()[0]?.engineLang}`);
assert(liveSwitch.active()[0].emit("es-ES", "Buenas noches a todos") === "final", "Spanish spoken during a live switch publishes");
assert(liveSpeech.errors.length === 0, `live switch raised ${liveSpeech.errors.join(" | ")}`);

const rejected = createRecognitionWorld({ stickyFirstInstance: true, rejectLocales: ["es-ES"] });
const rejectedSpeech = harness(rejected, true);
rejectedSpeech.speech.start();
await flush();
assert(rejected.active()[0].emit("en-US", "Welcome everyone") === "final", "English still works before a rejected locale");
rejectedSpeech.speech.stop();
await flush();
rejectedSpeech.speech.setLang("es-ES");
rejectedSpeech.speech.start();
await flush();
assert(
  rejectedSpeech.errors.some(
    (message) => message.includes("es-ES") && message.includes("language-not-supported") && message.includes("Type a caption"),
  ),
  `rejected Spanish locale should name es-ES: ${rejectedSpeech.errors.join(" | ")}`,
);
assert(rejected.active().length === 0, "rejected locale is not left listening");
rejectedSpeech.speech.setLang("pt-BR");
rejectedSpeech.speech.start();
await flush();
assert(rejected.active()[0]?.engineLang === "pt-BR", "Portuguese still starts after Spanish was rejected");
assert(rejected.active()[0].emit("pt-BR", "Boa noite a todos") === "final", "Portuguese final after a rejected Spanish locale");

const chrome = createRecognitionWorld({ stickyFirstInstance: false });
const chromeSpeech = harness(chrome, false);
chromeSpeech.speech.setLang("en-US");
chromeSpeech.speech.start();
await flush();
assert(chrome.active()[0].emit("en-US", "Welcome everyone") === "final", "Chrome English final");
chromeSpeech.speech.setLang("es-ES");
await flush();
assert(chrome.instances.length >= 2, "Chrome rebuilds the recognizer for a new locale");
assert(chrome.active().length === 1, "Chrome stale session is not left running");
assert(chrome.active()[0].engineLang === "es-ES", "Chrome Spanish session is es-ES");
assert(chrome.active()[0].emit("es-ES", "Buenas noches a todos") === "final", "Chrome Spanish final");
chromeSpeech.speech.setLang("pt-BR");
await flush();
assert(chrome.active()[0]?.engineLang === "pt-BR", "Chrome Portuguese session is pt-BR");
assert(chrome.active()[0].emit("pt-BR", "Boa noite a todos") === "final", "Chrome Portuguese final");
assert(chromeSpeech.errors.length === 0, `Chrome switch raised ${chromeSpeech.errors.join(" | ")}`);

const second = createRecognitionWorld({ stickyFirstInstance: true });
const secondSpeech = harness(second, true);
secondSpeech.speech.start();
await flush();
assert(second.active()[0].emit("en-US", "First phrase") === "final", "first iPhone phrase");
await flush();
assert(second.active()[0]?.emit("en-US", "Second phrase") === "final", "second iPhone phrase reuses index 0");
assert(
  secondSpeech.finals.join("|") === "First phrase|Second phrase",
  `iPhone second utterance dropped: ${secondSpeech.finals.join("|")}`,
);

const uttered = createRecognitionWorld({ stickyFirstInstance: true });
const utteredSpeech = harness(uttered, true, {
  scheduleCommit: (run) => {
    utteredSpeech.commit = run;
  },
});
utteredSpeech.speech.start();
await flush();
assert(uttered.active()[0].emitPartial("en-US", "Hola") === "interim", "iPhone partial");
assert(uttered.active()[0].emitPartial("en-US", "Hola a todos") === "interim", "iPhone partial grew");
assert(uttered.active()[0].emitPartial("en-US", "") === "interim", "empty Safari result keeps the phrase");
assert(utteredSpeech.finals.length === 0, "iPhone interims stay on the phone until the utterance ends");
assert(uttered.active()[0].finish() === "end", "iPhone utterance ended without isFinal");
await flush();
assert(
  utteredSpeech.finals.join("|") === "Hola a todos",
  `onend promotes the latest interim only: ${utteredSpeech.finals.join("|")}`,
);
assert(uttered.active()[0]?.emitPartial("en-US", "Hola a todos") === "interim", "same phrase can be spoken again");
uttered.active()[0].finish();
await flush();
assert(
  utteredSpeech.finals.join("|") === "Hola a todos|Hola a todos",
  `repeated iPhone utterance: ${utteredSpeech.finals.join("|")}`,
);

const stalled = createRecognitionWorld({ stickyFirstInstance: true });
const stalledSpeech = harness(stalled, true, {
  scheduleCommit: (run) => {
    stalledSpeech.commit = run;
  },
});
stalledSpeech.speech.start();
await flush();
const stalledRec = stalled.active()[0];
assert(stalledRec.emitPartial("en-US", "Buenos") === "interim");
assert(stalledRec.emitPartial("en-US", "Buenos dias") === "interim");
assert(stalledSpeech.finals.length === 0, "stalled interim is not pushed on every keystroke");
assert(typeof stalledSpeech.commit === "function", "iPhone schedules one commit for a stalled interim");
stalledSpeech.commit();
assert(stalledSpeech.finals.join("|") === "Buenos dias", `stalled interim publishes once: ${stalledSpeech.finals.join("|")}`);
stalledSpeech.commit();
stalledRec.emitPartial("en-US", "Buenos dias");
stalledSpeech.commit();
assert(stalledSpeech.finals.length === 1, "repeating the same interim does not flood peers");
assert(stalledRec.emit("en-US", "Buenos dias") === "final", "a late engine final still ends the utterance");
assert(stalledSpeech.finals.length === 1, `late isFinal is not a second caption: ${stalledSpeech.finals.join("|")}`);

const half = createRecognitionWorld({ stickyFirstInstance: true });
const halfSpeech = harness(half, true, {
  scheduleCommit: (run) => {
    halfSpeech.commit = run;
  },
});
halfSpeech.speech.start();
await flush();
assert(half.active()[0].emitPartial("en-US", "not sent") === "interim");
halfSpeech.speech.stop();
await flush();
halfSpeech.commit?.();
assert(halfSpeech.finals.length === 0, "Stop does not publish a half utterance");

const chromeDraft = createRecognitionWorld({ stickyFirstInstance: false });
let chromeCommits = 0;
const chromeDraftSpeech = harness(chromeDraft, false, {
  scheduleCommit: () => {
    chromeCommits += 1;
  },
});
chromeDraftSpeech.speech.start();
await flush();
assert(chromeDraft.active()[0].emitPartial("en-US", "draft only") === "interim");
chromeDraft.active()[0].finish();
await flush();
assert(chromeDraftSpeech.finals.length === 0, "Chrome does not promote interim drafts");
assert(chromeCommits === 0, "Chrome does not schedule an interim commit");
assert(chromeDraft.active()[0].emit("en-US", "Welcome everyone") === "final", "Chrome final still publishes");

// Join publishes isFinal only. The quiet timer is disabled here so a pass means
// no-speech / onend itself delivered the line, not a later stall commit.
function joinPublishHarness(world) {
  const published = [];
  const localDrafts = [];
  const errors = [];
  const speech = createWebSpeechProvider({
    appleMobile: true,
    recognitionCtor: world.Rec,
    scheduleRestart: (run) => queueMicrotask(run),
    scheduleCommit: () => {},
    scheduleWatchdog: () => {},
  });
  speech.onResult = (result) => {
    if (result.isFinal) published.push(result.text);
    else if (result.text.trim()) localDrafts.push(result.text.trim());
  };
  speech.onError = (message) => errors.push(message);
  return { speech, published, localDrafts, errors };
}

const heardDropped = createRecognitionWorld({ stickyFirstInstance: true });
const heardJoin = joinPublishHarness(heardDropped);
heardJoin.speech.start();
await flush();
assert(heardDropped.active()[0].emitPartial("en-US", "Welcome brothers") === "interim", "iPhone draft before no-speech");
assert(heardDropped.active()[0].noSpeech({ end: false }) === "no-speech", "Safari no-speech can skip onend");
assert(
  heardJoin.published.join("|") === "Welcome brothers",
  `Join publish path gets the heard phrase when onend is skipped: ${heardJoin.published.join("|")}`,
);
assert(heardJoin.localDrafts.includes("Welcome brothers"), "interim stayed local before the final");
assert(heardJoin.errors.length === 0, `heard no-speech without onend raised ${heardJoin.errors.join(" | ")}`);

const heardSpanish = createRecognitionWorld({ stickyFirstInstance: true });
const heardSpanishJoin = joinPublishHarness(heardSpanish);
heardSpanishJoin.speech.setLang(speechLocale("es"), true);
heardSpanishJoin.speech.start();
await flush();
assert(heardSpanish.instances.length === 1, "Spanish no-speech uses the primed recognizer");
assert(heardSpanish.active()[0]?.engineLang === "es-ES", "Spanish no-speech session is es-ES");
assert(heardSpanish.active()[0].emitPartial("es-ES", "Buenas noches a todos") === "interim", "Spanish draft before no-speech");
assert(heardSpanish.active()[0].noSpeech({ end: false }) === "no-speech", "Spanish no-speech can skip onend");
assert(
  heardSpanishJoin.published.join("|") === "Buenas noches a todos",
  `Spanish no-speech still publishes: ${heardSpanishJoin.published.join("|")}`,
);
assert(heardSpanishJoin.errors.length === 0, `Spanish no-speech raised ${heardSpanishJoin.errors.join(" | ")}`);

const heardPortuguese = createRecognitionWorld({ stickyFirstInstance: true });
const heardPortugueseJoin = joinPublishHarness(heardPortuguese);
heardPortugueseJoin.speech.setLang(speechLocale("pt"), true);
heardPortugueseJoin.speech.start();
await flush();
assert(heardPortuguese.active()[0]?.engineLang === "pt-BR", "Portuguese no-speech session is pt-BR");
assert(heardPortuguese.active()[0].emitPartial("pt-BR", "Boa noite a todos") === "interim", "Portuguese draft before no-speech");
assert(heardPortuguese.active()[0].noSpeech({ end: true }) === "no-speech", "Portuguese no-speech then onend");
await flush();
assert(
  heardPortugueseJoin.published.join("|") === "Boa noite a todos",
  `Portuguese no-speech publishes one final: ${heardPortugueseJoin.published.join("|")}`,
);
assert(heardPortuguese.instances.length === 1, "Portuguese no-speech does not build a second recognizer");
assert(heardPortugueseJoin.errors.length === 0, `Portuguese no-speech raised ${heardPortugueseJoin.errors.join(" | ")}`);

const heardEnded = createRecognitionWorld({ stickyFirstInstance: true });
const heardEndJoin = joinPublishHarness(heardEnded);
heardEndJoin.speech.start();
await flush();
assert(heardEnded.active()[0].emitPartial("en-US", "Welcome") === "interim");
assert(heardEnded.active()[0].emitPartial("en-US", "Welcome brothers") === "interim", "longer iPhone draft replaces the short one");
assert(heardEnded.active()[0].emitPartial("en-US", "") === "interim", "empty Safari result keeps the heard phrase");
assert(heardEnded.active()[0].noSpeech({ end: true }) === "no-speech", "no-speech then onend");
await flush();
assert(
  heardEndJoin.published.join("|") === "Welcome brothers",
  `no-speech and onend publish one Join final: ${heardEndJoin.published.join("|")}`,
);
assert(heardEndJoin.errors.length === 0, `heard no-speech with onend raised ${heardEndJoin.errors.join(" | ")}`);
assert(heardEnded.active().length === 1, "session end restarts the same iPhone recognizer");
assert(heardEnded.instances.length === 1, "no-speech does not build a second recognizer");

const silentJoinWorld = createRecognitionWorld({ stickyFirstInstance: true });
const silentJoin = joinPublishHarness(silentJoinWorld);
silentJoin.speech.start();
await flush();
assert(silentJoinWorld.active()[0].noSpeech({ end: true }) === "no-speech", "empty pause is no-speech");
await flush();
assert(silentJoin.published.length === 0, "empty no-speech does not invent a caption");
assert(silentJoin.localDrafts.length === 0, "empty no-speech does not invent an interim");
assert(
  silentJoin.errors.some((message) => message.includes("(no-speech)") && message.includes("Type a caption")),
  `empty no-speech is shown: ${silentJoin.errors.join(" | ")}`,
);
assert(silentJoinWorld.active().length === 1, "empty no-speech keeps the iPhone mic armed");

const chromeSilence = createRecognitionWorld({ stickyFirstInstance: false });
const chromeSilenceSpeech = harness(chromeSilence, false, { scheduleCommit: () => {} });
chromeSilenceSpeech.speech.start();
await flush();
assert(chromeSilence.active()[0].emitPartial("en-US", "Welcome brothers") === "interim", "Android interim before no-speech");
assert(chromeSilence.active()[0].noSpeech({ end: true }) === "no-speech", "Android no-speech");
await flush();
assert(chromeSilenceSpeech.finals.length === 0, "Android no-speech does not promote an interim");
assert(
  !chromeSilenceSpeech.errors.some((message) => message.includes("(no-speech)")),
  "Android no-speech is not the iPhone note",
);

assert(uiLangFromTags(["pt-BR", "en-US"]) === "pt", "pt-BR browser language selects Portuguese UI");
assert(uiLangFromTags(["es-MX"]) === "es", "es-MX browser language selects Spanish UI");
assert(uiLangFromTags(["fr-FR", "de"]) === "en", "other browser languages fall back to English UI");
assert(uiLangFromTags(undefined) === "en", "missing browser languages fall back to English UI");
assert(getUiLang() === "en", "this environment starts in English");
assert(t("createRoom") === "Create room", "English create-room label");
assert(t("spokenQuestion") === "What language are you speaking?", "English spoken question");
assert(speechLocale("en") === "en-US" && speechLocale("es") === "es-ES" && speechLocale("pt") === "pt-BR", "spoken locales stay independent of UI language");

setUiLang("es");
assert(getUiLang() === "es", "Spanish UI language is selected");
assert(t("createRoom") === "Crear sala", "Spanish create-room label");
assert(t("spokenQuestion") === "¿En qué idioma vas a hablar?", "Spanish spoken question");
assert(t("watchQuestion") === "¿Qué idioma quieres ver?", "Spanish watch question");
assert(t("join") === "Entrar", "Spanish join button");
assert(t("send") === "Enviar", "Spanish send button");
assert(t("start") === "Iniciar" && t("stop") === "Detener", "Spanish mic buttons");
assert(displayCopy("Someone else is speaking") === "Otra persona está hablando", "Spanish floor-busy copy");
assert(displayCopy("Someone else is speaking · Ada") === "Otra persona está hablando · Ada", "Spanish floor-busy keeps the name");
assert(displaySpeaker("Host") === "Anfitrión" && displaySpeaker("Ada") === "Ada", "Spanish host label, custom names stay");
assert(canonicalRole("Invitado", "Guest") === "Guest", "Spanish guest label stores as Guest");
assert(canonicalRole("Ana", "Guest") === "Ana", "typed names are not rewritten");
const esSetup = watchChipsHtml("data-setup-watch-lang");
assert(esSetup.includes('data-setup-watch-lang="es"'), "Spanish setup watch chips keep their attribute");
assert(esSetup.includes(">English<") || esSetup.includes(">English</span>"), "watch language names stay endonyms");
assert(esSetup.includes("solo"), "Spanish watch scope");
assert(!esSetup.includes('data-setup-watch="'), "setup watch chips do not reuse the container attribute");
assert(speechLocale("pt") === "pt-BR", "Spanish UI does not change the Portuguese recognizer");

setUiLang("pt");
assert(t("createRoom") === "Criar sala", "Portuguese create-room label");
assert(t("spokenQuestion") === "Em que idioma você vai falar?", "Portuguese spoken question");
assert(t("join") === "Entrar" && t("send") === "Enviar", "Portuguese join and send");
assert(t("start") === "Iniciar" && t("stop") === "Parar", "Portuguese mic buttons");
assert(t("spokenLanguage") === "Idioma falado", "Portuguese spoken label stays independent of interface language");
assert(t("uiLangTagline").includes("grupos"), "Portuguese tagline still translates");
assert(displayCopy("Could not reclaim the mic.") === "Não foi possível retomar o microfone.", "Portuguese reclaim error");
const localeNote = localeRejectedMessage("pt-BR", "language-not-supported");
assert(displayCopy(localeNote).includes("pt-BR") && displayCopy(localeNote).includes("Safari"), "Portuguese Safari rejection names the locale");
assert(displayCopy(localeNote) !== localeNote, "Portuguese Safari rejection is translated");
const ptEmpty = renderCaptionBoard({ layout: "en-es-pt", lines: [] }, null, ["en", "es", "pt"]);
assert(ptEmpty.html.includes("Aguardando a fala ao vivo"), "Portuguese empty caption");
assert(ptEmpty.html.includes("EN · English") && ptEmpty.html.includes("ES · Español") && ptEmpty.html.includes("PT · Português"), "pane headers stay language names");
assert(ptEmpty.shown.join(",") === "en,es,pt", "watch panes do not follow the interface language");
const tvLang = uiLangSwitcherHtml("tv");
assert(tvLang.includes(">EN<") && tvLang.includes(">ES<") && tvLang.includes(">PT<"), "TV language picker uses EN ES PT");
assert(!tvLang.includes(">English<") && !tvLang.includes(">Español<") && !tvLang.includes(">Português<"), "TV language picker omits full names");
assert(tvLang.includes("ui-lang-tv"), "TV language picker stays on one row");
const homeLang = uiLangSwitcherHtml("home");
assert(
  homeLang.includes(">English<") && homeLang.includes(">Español<") && homeLang.includes(">Português<"),
  "Create screen keeps interface language names",
);
assert(homeLang.includes("uiLangTagline"), "Create screen keeps the tagline with the interface picker");
const entryLang = uiLangSwitcherHtml("entry");
assert(entryLang.includes(">English<") && entryLang.includes("uiLangLabel"), "Join setup keeps the interface language picker");
assert(!entryLang.includes("uiLangHint"), "interface picker no longer includes the host-only hint");

const memory = new Map();
globalThis.localStorage = {
  getItem(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value) {
    memory.set(key, String(value));
  },
  removeItem(key) {
    memory.delete(key);
  },
};
setUiLang("pt");
assert(localStorage.getItem(UI_LANG_STORAGE_KEY) === "pt", "Portuguese UI language is stored on the device");
setUiLang("en");
assert(getUiLang() === "en", "English UI language can be selected again");
assert(localStorage.getItem(UI_LANG_STORAGE_KEY) === "en", "English UI language is stored on the device");
assert(t("createRoom") === "Create room", "English labels return");
assert(displayCopy("Someone else is speaking") === "Someone else is speaking", "English floor-busy copy returns");
const enListening = renderCaptionBoard(
  { layout: "en", lines: [], listening: true, floor: { holderId: "h", holderName: "Host" } },
  null,
  ["en"],
);
assert(enListening.html.includes("Listening…"), "English listening label returns");
assert(enListening.html.includes('class="line-speaker">Host'), "English host label returns");

console.log("OK route — lang= is TV-only, opt-in, and omitted from the combined TV link");
