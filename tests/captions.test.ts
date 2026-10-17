import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFinalLine, provisionalLine, settleProvisional } from "../src/caption-history.ts";
import type { CaptionLine } from "../src/types.ts";

const line = (id: string, text: Partial<CaptionLine["text"]>): CaptionLine => ({
  id,
  isFinal: true,
  text: { en: "", es: "", pt: "", ...text },
  at: 1,
});

describe("show the original immediately", () => {
  it("a new provisional line has only the spoken pane", () => {
    const p = provisionalLine("hola a todos", "es", "Ana", undefined, 5, "p");
    assert.deepEqual(p.text, { en: "", es: "hola a todos", pt: "" });
    assert.equal(p.speaker, "Ana");
  });

  it("a growing revision keeps the last line's translations until new ones land", () => {
    const last = line("L", { es: "hola", en: "hello", pt: "olá" });
    const p = provisionalLine("hola a todos", "es", "Ana", last, 5, "p");
    assert.deepEqual(p.text, { en: "hello", es: "hola a todos", pt: "olá" });
    const shown = applyFinalLine([last], p, "es");
    assert.equal(shown.length, 1);
    assert.equal(shown[0].id, "L", "replace keeps the line id");
  });

  it("settles the translated line in place by id", () => {
    const lines = [line("a", { en: "one" }), line("p", { es: "dos" })];
    const done = settleProvisional(lines, line("p", { es: "dos", en: "two", pt: "dois" }), "es", true);
    assert.deepEqual(done.map((l) => l.id), ["a", "p"]);
    assert.equal(done[1].text.en, "two");
  });

  it("files the translation as new when the provisional was cleared", () => {
    const done = settleProvisional([], line("p", { es: "dos", en: "two" }), "es", true);
    assert.deepEqual(done.map((l) => l.id), ["p"]);
  });
});
