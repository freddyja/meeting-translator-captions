import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { swapGuestLangs, swapHostLangs } from "../src/lang-swap.ts";
import {
  createHandsFreeTurns,
  handsFreePair,
  otherLang,
  utteranceLang,
} from "../src/stt/hands-free.ts";
import { createWebSpeechProvider } from "../src/stt/web-speech.ts";
import { cleanOcrText, OCR_MAX_CHARS, tesseractLangs } from "../src/input/ocr.ts";
import {
  createNativeEngine,
  inkBounds,
  pickHandwritingEngine,
  type HandwritingEngine,
} from "../src/input/handwriting.ts";

describe("language swap ⇄", () => {
  it("host trades Spoken and a single Watch language", () => {
    assert.deepEqual(swapHostLangs("en", "es"), { spoken: "es", layout: "en" });
    assert.deepEqual(swapHostLangs("pt", "en"), { spoken: "en", layout: "pt" });
  });
  it("host cannot swap with all three panes or the same language", () => {
    assert.equal(swapHostLangs("en", "en-es-pt"), null);
    assert.equal(swapHostLangs("es", "es"), null);
  });
  it("guest trades Spoken and Watch, not 'all'", () => {
    assert.deepEqual(swapGuestLangs("es", "pt"), { spoken: "pt", watch: "es" });
    assert.equal(swapGuestLangs("es", "all"), null);
    assert.equal(swapGuestLangs("es", "es"), null);
  });
});

describe("hands-free turn-taking", () => {
  it("pairs Spoken with a different single Watch language, else a sensible partner", () => {
    assert.deepEqual(handsFreePair("en", "pt"), ["en", "pt"]);
    assert.deepEqual(handsFreePair("en", "en-es-pt"), ["en", "es"]);
    assert.deepEqual(handsFreePair("es", "es"), ["es", "en"]);
    assert.equal(otherLang("en", ["en", "pt"]), "pt");
  });

  it("files a phrase under the pair language its words support", () => {
    const pair = ["en", "es"] as const;
    assert.equal(utteranceLang("hola hermanos, gracias por venir", "en", pair), "es");
    assert.equal(utteranceLang("thank you everyone for coming", "es", pair), "en");
    // Ambiguous words: the listening language stands.
    assert.equal(utteranceLang("ok", "es", pair), "es");
    // Portuguese is not in this pair, so it cannot be chosen here.
    assert.equal(utteranceLang("obrigado pessoal, boa noite", "en", pair), "en");
  });

  function fakeClock() {
    let next = 1;
    const timers = new Map<number, () => void>();
    return {
      setTimer: (run: () => void) => {
        const id = next++;
        timers.set(id, run);
        return id;
      },
      clearTimer: (id: unknown) => void timers.delete(id as number),
      fire() {
        const pending = [...timers.entries()];
        timers.clear();
        for (const [, run] of pending) run();
      },
      get size() {
        return timers.size;
      },
    };
  }

  it("after a phrase and a quiet gap, listens for the other person", () => {
    const clock = fakeClock();
    const ends: string[] = [];
    const turns = createHandsFreeTurns({
      pair: ["en", "es"],
      listening: "en",
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      onTurnEnd: (lang) => ends.push(lang),
    });
    assert.equal(turns.heard("good", false), undefined);
    assert.equal(clock.size, 0, "no turn end before a finished phrase");
    assert.equal(turns.heard("thank you everyone", true), "en");
    assert.equal(clock.size, 1);
    clock.fire();
    assert.deepEqual(ends, ["es"]);
    assert.equal(turns.listening, "es");
    // The Spanish speaker answers; then the floor goes back to English.
    assert.equal(turns.heard("muchas gracias, hermanos", true), "es");
    clock.fire();
    assert.deepEqual(ends, ["es", "en"]);
  });

  it("an interim keeps the turn open; manual switch and stop cancel it", () => {
    const clock = fakeClock();
    const ends: string[] = [];
    const turns = createHandsFreeTurns({
      pair: ["en", "pt"],
      listening: "en",
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      onTurnEnd: (lang) => ends.push(lang),
    });
    turns.heard("hello friends", true);
    turns.heard("and also", false);
    assert.equal(clock.size, 1, "re-armed, not doubled");
    turns.listenIn("pt");
    assert.equal(clock.size, 0);
    assert.equal(turns.listening, "pt");
    turns.heard("obrigado pessoal", true);
    turns.stop();
    clock.fire();
    assert.deepEqual(ends, []);
    assert.equal(turns.heard("hello", true), undefined);
  });

  it("iPhone rule: switching turn language reuses the first recognizer and only changes lang", () => {
    const made: Array<{ lang: string; starts: number }> = [];
    class FakeRec {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      starts = 0;
      live = false;
      onstart: (() => void) | null = null;
      onaudiostart: (() => void) | null = null;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() {
        made.push(this as unknown as { lang: string; starts: number });
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
    }
    const speech = createWebSpeechProvider({
      appleMobile: true,
      recognitionCtor: FakeRec as never,
      scheduleRestart: (run) => run(),
      scheduleCommit: () => undefined,
      scheduleWatchdog: () => undefined,
    });
    speech.setLang("en-US", true);
    speech.start();
    // Quiet-gap turn end (timer path, no tap) flips to Spanish, then back.
    speech.setLang("es-ES", true);
    speech.setLang("en-US", true);
    speech.setLang("pt-BR", true);
    assert.equal(made.length, 1, "one webkitSpeechRecognition for the whole session");
    assert.equal(made[0].lang, "pt-BR");
    speech.stop();
  });
});

describe("photo OCR text", () => {
  it("maps EN/ES/PT to tesseract eng/spa/por, auto loads all three", () => {
    assert.equal(tesseractLangs("en"), "eng");
    assert.equal(tesseractLangs("es"), "spa");
    assert.equal(tesseractLangs("pt"), "por");
    assert.equal(tesseractLangs("auto"), "eng+spa+por");
  });
  it("joins lines and hyphenation, drops noise lines, caps length", () => {
    assert.equal(cleanOcrText("SALIDA DE\nEMER-\ngencia\n|| ~\n"), "SALIDA DE EMERgencia");
    assert.equal(cleanOcrText("  \n \n"), "");
    const long = cleanOcrText("palabra ".repeat(200));
    assert.ok(long.length <= OCR_MAX_CHARS + 1);
    assert.ok(long.endsWith("…"));
  });
});

describe("handwriting", () => {
  const ocrEngine: HandwritingEngine = { kind: "ocr", recognize: async () => "ocr" };

  it("falls back to OCR when the browser has no Handwriting Recognition API", async () => {
    assert.equal((await pickHandwritingEngine("en", ocrEngine, {}, undefined)).kind, "ocr");
    assert.equal((await pickHandwritingEngine("en", ocrEngine, undefined, undefined)).kind, "ocr");
  });

  it("falls back when the API has no model for the language", async () => {
    const nav = {
      createHandwritingRecognizer: async () => ({ startDrawing: () => ({}) as never }),
      queryHandwritingRecognizer: async () => null,
    };
    assert.equal((await pickHandwritingEngine("pt", ocrEngine, nav, class {})).kind, "ocr");
  });

  it("uses navigator.createHandwritingRecognizer when available", async () => {
    const seen: unknown[] = [];
    class Stroke {
      points: unknown[] = [];
      addPoint(p: unknown) {
        this.points.push(p);
      }
    }
    const nav = {
      queryHandwritingRecognizer: async () => ({ textAlternatives: true }),
      createHandwritingRecognizer: async (c: { languages: string[] }) => {
        seen.push(c.languages);
        return {
          startDrawing: () => {
            const strokes: Stroke[] = [];
            return {
              addStroke: (s: Stroke) => void strokes.push(s),
              getPrediction: async () => [{ text: ` hola (${strokes.length}/${strokes[0].points.length}) ` }],
              clear: () => undefined,
            };
          },
        };
      },
    };
    const engine = await pickHandwritingEngine("es", ocrEngine, nav as never, Stroke);
    assert.equal(engine.kind, "native");
    const text = await engine.recognize(
      [
        [
          { x: 1, y: 1, t: 0 },
          { x: 5, y: 9, t: 16 },
        ],
      ],
      "es",
    );
    assert.equal(text, "hola (1/2)");
    assert.deepEqual(seen, [["es"]]);
    assert.equal(await createNativeEngine(nav as never, Stroke).recognize([], "es"), "");
  });

  it("finds the ink box for cropping", () => {
    assert.equal(inkBounds([]), null);
    assert.deepEqual(inkBounds([[{ x: 10, y: 20, t: 0 }, { x: 30, y: 25, t: 1 }]], 5), { x: 5, y: 15, w: 30, h: 15 });
  });
});
