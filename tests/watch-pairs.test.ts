import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { swapGuestLangs } from "../src/lang-swap.ts";
import {
  isWatchLang,
  isWatchPair,
  langsForLayout,
  langsForWatch,
  LAYOUTS,
  parseWatchLang,
  WATCH_PAIRS,
} from "../src/types.ts";

describe("guest Watch pairs (EN | ES, EN | PT, ES | PT)", () => {
  it("isWatchLang accepts singles, pairs and all", () => {
    for (const v of ["en", "es", "pt", "all", "en-es", "en-pt", "es-pt"]) assert.equal(isWatchLang(v), true, v);
  });

  it("isWatchLang rejects other values, including the host-only all-three layout id", () => {
    for (const v of ["", "es-en", "pt-en", "en-es-pt", "EN", "fr", null, undefined, 3, {}]) {
      assert.equal(isWatchLang(v), false, String(v));
    }
    assert.equal(isWatchPair("en"), false);
    assert.equal(isWatchPair("all"), false);
    assert.deepEqual(WATCH_PAIRS, ["en-es", "en-pt", "es-pt"]);
  });

  it("parseWatchLang keeps old stored values and falls back to all", () => {
    assert.equal(parseWatchLang("en"), "en");
    assert.equal(parseWatchLang("pt"), "pt");
    assert.equal(parseWatchLang("all"), "all");
    assert.equal(parseWatchLang("es-pt"), "es-pt");
    assert.equal(parseWatchLang(null), "all");
    assert.equal(parseWatchLang("garbage"), "all");
  });

  it("langsForWatch shows exactly the two panes of a pair, in order", () => {
    assert.deepEqual(langsForWatch("en-es"), ["en", "es"]);
    assert.deepEqual(langsForWatch("en-pt"), ["en", "pt"]);
    assert.deepEqual(langsForWatch("es-pt"), ["es", "pt"]);
    assert.deepEqual(langsForWatch("es"), ["es"]);
    assert.deepEqual(langsForWatch("all"), ["en", "es", "pt"]);
  });

  it("a guest pair matches the panes of the same room layout id", () => {
    for (const pair of WATCH_PAIRS) assert.deepEqual(langsForWatch(pair), langsForLayout(pair));
  });

  it("swap is off for pairs (and all), still works for one language", () => {
    for (const pair of WATCH_PAIRS) assert.equal(swapGuestLangs("en", pair), null);
    assert.deepEqual(swapGuestLangs("en", "es"), { spoken: "es", watch: "en" });
  });

  it("host Create room chips are unchanged (no pairs offered to the host)", () => {
    assert.deepEqual(
      LAYOUTS.map((l) => l.id),
      ["en", "es", "pt", "en-es-pt"],
    );
  });
});
