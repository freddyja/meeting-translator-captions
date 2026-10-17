import assert from "node:assert/strict";
import { describe, it } from "node:test";

// caption-board pulls in i18n, which reads navigator/localStorage lazily.
const { isScrolledUp, nextPillState, renderCaptionBoard } = await import("../src/views/caption-board.ts");

describe("New captions pill", () => {
  it("knows when a pane is scrolled up", () => {
    assert.equal(isScrolledUp({ scrollHeight: 500, scrollTop: 300, clientHeight: 200 }), false);
    assert.equal(isScrolledUp({ scrollHeight: 500, scrollTop: 100, clientHeight: 200 }), true);
  });

  it("shows only for a reader scrolled up when content changes, and sticks until they return", () => {
    let s = nextPillState(undefined, "a", true);
    assert.equal(s.unseen, false, "first paint");
    s = nextPillState(s, "a", true);
    assert.equal(s.unseen, false, "unchanged");
    s = nextPillState(s, "ab", true);
    assert.equal(s.unseen, true, "new caption while scrolled up");
    s = nextPillState(s, "ab", true);
    assert.equal(s.unseen, true, "still unseen");
    s = nextPillState(s, "abc", false);
    assert.equal(s.unseen, false, "following the bottom");
  });

  it("renders a hidden pill per pane", () => {
    const { html } = renderCaptionBoard({ layout: "en-es-pt", lines: [] });
    assert.equal((html.match(/data-new-captions=/g) ?? []).length, 3);
    assert.match(html, /data-new-captions="es" hidden/);
  });
});
