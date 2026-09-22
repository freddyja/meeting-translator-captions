import { joinSearch, parseRoute, parseTvLang, tvSearch } from "../src/router.ts";
import { detectSpeechCapability, isAppleMobile } from "../src/stt/capability.ts";
import { createWebSpeechProvider } from "../src/stt/web-speech.ts";
import { keepsLocalCaptions, lostFloor, reconcileFloor, speechLocale } from "../src/types.ts";

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

function harness(world, appleMobile) {
  const finals = [];
  const errors = [];
  const speech = createWebSpeechProvider({
    appleMobile,
    recognitionCtor: world.Rec,
    scheduleRestart: (run) => queueMicrotask(run),
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

console.log("OK route — lang= is TV-only, opt-in, and omitted from the combined TV link");
