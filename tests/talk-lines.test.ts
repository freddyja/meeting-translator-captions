import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captionIn, captionsIn, shownLang, type TalkLine } from "../src/talk-lines.ts";

const lines: TalkLine[] = [
  { id: 1, lang: "en", original: "Good evening", rows: { en: "Good evening", es: "Buenas noches", pt: "Boa noite" } },
  { id: 2, lang: "es", original: "Muchas gracias", rows: { en: "Thank you very much", es: "Muchas gracias", pt: "Muito obrigado" } },
  { id: 3, lang: "en", original: "Welcome", rows: null },
];

describe("two-person conversation captions", () => {
  it("the split view shows each phrase in the other person's language", () => {
    assert.equal(shownLang(lines[0], ["en", "es"]), "es");
    assert.equal(shownLang(lines[1], ["en", "es"]), "en");
  });

  it("expanded view reads every phrase in one language, own words untouched", () => {
    assert.deepEqual(captionsIn(lines, "es"), [
      { id: 1, text: "Buenas noches", spoken: false },
      { id: 2, text: "Muchas gracias", spoken: true },
      { id: 3, text: null, spoken: false },
    ]);
    assert.deepEqual(
      captionsIn(lines, "en").map((row) => row.text),
      ["Good evening", "Thank you very much", "Welcome"],
    );
  });

  it("a phrase still translating has no text yet, then fills in live", () => {
    const line: TalkLine = { ...lines[2] };
    assert.equal(captionIn(line, "es"), null);
    line.rows = { en: "Welcome", es: "Bienvenidos", pt: "Bem-vindos" };
    assert.equal(captionIn(line, "es"), "Bienvenidos");
  });
});
