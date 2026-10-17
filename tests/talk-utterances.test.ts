import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWebSpeechProvider } from "../src/stt/web-speech.ts";
import {
  createTalkTranscript,
  createUtteranceTracker,
  mergeTranscript,
  TALK_TRANSLATE_DEBOUNCE_MS,
} from "../src/talk-utterances.ts";
import type { Lang } from "../src/types.ts";

/** Manual clock for debounce timers and the re-emit grace window. */
function fakeClock() {
  let time = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => time,
    setTimer: (run: () => void, ms: number) => {
      seq += 1;
      timers.set(seq, { at: time + ms, run });
      return seq;
    },
    clearTimer: (id: unknown) => void timers.delete(id as number),
    advance(ms: number) {
      const end = time + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        time = due[1].at;
        due[1].run();
      }
      time = end;
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness() {
  const clock = fakeClock();
  const calls: Array<{ text: string; from: Lang }> = [];
  let changes = 0;
  const transcript = createTalkTranscript({
    translate: async (text, from) => {
      calls.push({ text, from });
      return { en: `en:${text}`, es: `es:${text}`, pt: `pt:${text}` };
    },
    onChange: () => (changes += 1),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  return { clock, calls, transcript, changes: () => changes };
}

type Chunk = { isFinal: boolean; 0: { transcript: string } };

/** Minimal webkitSpeechRecognition double: tests push result lists and end sessions. */
class FakeRec {
  static made: FakeRec[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  live = false;
  starts = 0;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onresult: ((e: { resultIndex: number; results: Chunk[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRec.made.push(this);
  }
  start() {
    if (this.live) throw Object.assign(new Error("already started"), { name: "InvalidStateError" });
    this.live = true;
    this.starts += 1;
    this.onstart?.();
  }
  stop() {
    this.live = false;
    this.onend?.();
  }
  abort() {
    this.live = false;
    this.onend?.();
  }
  emit(results: Array<[string, boolean]>, resultIndex = 0) {
    this.onresult?.({ resultIndex, results: results.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })) });
  }
  /** One-shot session over (iOS); the provider restarts the same object. */
  end() {
    this.live = false;
    this.onend?.();
  }
}

describe("mergeTranscript", () => {
  it("treats duplicates, shorter re-emits and punctuation-only changes as the same words", () => {
    assert.deepEqual(mergeTranscript("just checking to see if", "just checking to see if"), {
      kind: "same",
      text: "just checking to see if",
    });
    assert.equal(mergeTranscript("Just checking to see if you", "just checking").kind, "same");
    assert.deepEqual(mergeTranscript("just checking to see if you", "Just checking to see if you."), {
      kind: "same",
      text: "Just checking to see if you.",
    });
    assert.equal(mergeTranscript("just checking to see if you", "to see if").text, "just checking to see if you");
  });

  it("extends, merges a re-emitted tail without duplicating it, and follows revisions", () => {
    assert.deepEqual(mergeTranscript("just checking to see if", "just checking to see if you understand"), {
      kind: "extend",
      text: "just checking to see if you understand",
    });
    assert.deepEqual(mergeTranscript("just checking to see if you", "see if you understand me"), {
      kind: "overlap",
      text: "just checking to see if you understand me",
    });
    assert.deepEqual(mergeTranscript("Solo quería comprobar si", "Solo quería saber si tú"), {
      kind: "revise",
      text: "Solo quería saber si tú",
    });
    assert.equal(mergeTranscript("just checking to see if you understand me", "Sí, te entiendo").kind, "unrelated");
  });
});

describe("one bubble per utterance (iOS Safari)", () => {
  it("stalled commit, restart, re-emitted and extended finals all land in ONE bubble", async () => {
    FakeRec.made = [];
    const commits: Array<() => void> = [];
    const speech = createWebSpeechProvider({
      appleMobile: true,
      recognitionCtor: FakeRec as never,
      scheduleRestart: (run) => run(),
      scheduleCommit: (run) => void commits.push(run),
      scheduleWatchdog: () => undefined,
    });
    const { clock, calls, transcript } = harness();
    let finals = 0;
    speech.onResult = (r) => {
      if (r.isFinal) finals += 1;
      if (r.text.trim()) transcript.heard(r.text, r.isFinal, "en");
    };
    speech.setLang("en-US", true);
    speech.start();
    const rec = FakeRec.made[0];

    // Session 1: cumulative interims, then Safari stalls -> the provider commits the draft.
    rec.emit([["just", false]]);
    clock.advance(200);
    rec.emit([["just checking", false]]);
    clock.advance(200);
    rec.emit([["just checking to see if", false]]);
    commits.at(-1)!();
    // Safari keeps the same session and the transcript grows past the commit.
    rec.emit([["just checking to see if you", false]]);
    // Session ends: the provider commits the longer draft, then restarts the SAME object.
    rec.end();
    // Session 2 (restart): Safari re-emits the earlier final, then an extended one.
    rec.emit([["just checking to see if you", true]]);
    rec.emit([["just checking to see if you understand", false]]);
    rec.emit([["just checking to see if you understand", true]]);
    rec.end();
    // Session 3: only the tail is re-emitted with the new word.
    rec.emit([["see if you understand me", true]]);

    assert.ok(finals >= 3, `several finals reached the page (${finals})`);
    assert.equal(transcript.lines.length, 1, "one bubble for the whole sentence");
    assert.equal(transcript.lines[0].original, "just checking to see if you understand me");
    assert.equal(FakeRec.made.length, 1, "iPhone rule: one recognizer, reused across restarts");
    await flush();
    assert.equal(transcript.lines[0].rows?.es, "es:just checking to see if you understand me");
    assert.equal(calls.at(-1)?.text, "just checking to see if you understand me", "final translated at once");
    speech.stop();
  });

  it("a late re-emit after the turn ended updates that bubble instead of adding one", async () => {
    const { clock, transcript } = harness();
    transcript.heard("Solo quería comprobar si lo has entendido", true, "es");
    transcript.close(); // silence/flip
    clock.advance(300);
    // iOS commits its draft as the locale flips: same words, or a longer copy.
    transcript.heard("Solo quería comprobar si lo has entendido", true, "en");
    transcript.heard("si lo has entendido bien", true, "en");
    assert.equal(transcript.lines.length, 1);
    assert.equal(transcript.lines[0].original, "Solo quería comprobar si lo has entendido bien");
    assert.equal(transcript.lines[0].lang, "es", "stays filed under the speaker's language");
    // The other person answers: a new bubble.
    transcript.heard("yes I understand you", false, "en");
    assert.equal(transcript.lines.length, 2);
    assert.equal(transcript.lines[1].lang, "en");
  });
});

describe("one bubble per utterance (Android Chrome)", () => {
  it("a continuous interim stream updates one bubble; translation is debounced, final is immediate", async () => {
    FakeRec.made = [];
    const speech = createWebSpeechProvider({
      appleMobile: false,
      recognitionCtor: FakeRec as never,
      scheduleRestart: (run) => run(),
    });
    const { clock, calls, transcript } = harness();
    speech.onResult = (r) => {
      if (r.text.trim()) transcript.heard(r.text, r.isFinal, "es");
    };
    speech.setLang("es-ES");
    speech.start();
    const rec = FakeRec.made.at(-1)!;
    const words = "Solo quería asegurarme de que me entiendes".split(" ");
    for (let i = 1; i <= words.length; i += 1) {
      // Chrome reports resultIndex 0 and the whole growing transcript.
      rec.emit([[words.slice(0, i).join(" "), false]]);
      clock.advance(150);
      await flush();
    }
    assert.equal(transcript.lines.length, 1);
    assert.equal(transcript.lines[0].live, true);
    assert.equal(calls.length, 0, "no translation while words keep arriving inside the debounce");
    clock.advance(TALK_TRANSLATE_DEBOUNCE_MS);
    await flush();
    assert.equal(calls.length, 1, "one debounced interim translation");
    assert.equal(transcript.lines[0].rows?.en, "en:Solo quería asegurarme de que me entiendes");
    rec.emit([["Solo quería asegurarme de que me entiendes.", true]]);
    // Chrome repeats the final at index 0 on the next event.
    rec.emit([["Solo quería asegurarme de que me entiendes.", true]]);
    await flush();
    assert.equal(transcript.lines.length, 1);
    assert.equal(transcript.lines[0].live, false);
    assert.equal(transcript.lines[0].original, "Solo quería asegurarme de que me entiendes.");
    assert.equal(calls.length, 2, "final translated immediately, once");
    speech.stop();
  });

  it("a final followed by new, unrelated speech starts a new bubble", () => {
    const { transcript } = harness();
    transcript.heard("good morning everyone", true, "en");
    transcript.heard("let us begin", false, "en");
    transcript.heard("let us begin the meeting", true, "en");
    assert.deepEqual(
      transcript.lines.map((l) => l.original),
      ["good morning everyone", "let us begin the meeting"],
    );
  });

  it("a slow reply for older text never overwrites the newer translation", async () => {
    const clock = fakeClock();
    const pending: Array<{ text: string; resolve: (rows: Record<Lang, string>) => void }> = [];
    const transcript = createTalkTranscript({
      translate: (text) => new Promise((resolve) => pending.push({ text, resolve })),
      onChange: () => undefined,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    transcript.heard("hello every", false, "en");
    clock.advance(TALK_TRANSLATE_DEBOUNCE_MS);
    transcript.heard("hello everyone", true, "en");
    assert.equal(pending.length, 2);
    pending[1].resolve({ en: "hello everyone", es: "hola a todos", pt: "olá a todos" });
    await flush();
    pending[0].resolve({ en: "hello every", es: "hola cada", pt: "olá cada" });
    await flush();
    assert.equal(transcript.lines[0].rows?.es, "hola a todos");
  });
});

describe("utterance tracker boundaries", () => {
  it("speaker change or silence closes the bubble; the next words open a new one", () => {
    let time = 0;
    const tracker = createUtteranceTracker({ now: () => time, graceMs: 2500 });
    const a = tracker.heard("hola a todos", false, "es")!;
    assert.equal(a.created, true);
    assert.equal(tracker.heard("hola a todos y bienvenidos", false, "es")!.utterance.id, a.utterance.id);
    tracker.close();
    time += 3000; // past the grace window: even the same words are a new utterance
    const b = tracker.heard("hola a todos", true, "es")!;
    assert.equal(b.created, true);
    assert.notEqual(b.utterance.id, a.utterance.id);
    assert.equal(tracker.heard("   ", false, "es"), null, "empty results are ignored");
  });
});
