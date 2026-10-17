import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `missing rule ${selector}`);
  return css.slice(at, css.indexOf("}", at));
}

describe("TV view fits the viewport", () => {
  it("the TV screen is exactly one viewport and clips overflow", () => {
    const r = rule(".tv-screen:not(.smart-view-captions)");
    assert.match(r, /height: 100dvh/);
    assert.match(r, /overflow: hidden/);
  });
  it("the board shares the leftover height per row and panes may shrink", () => {
    const board = rule(".tv-screen:not(.smart-view-captions) > .tv-board");
    assert.match(board, /min-height: 0/);
    assert.match(board, /grid-auto-rows: minmax\(0, 1fr\)/);
    assert.match(rule(".tv-screen:not(.smart-view-captions) .window"), /min-height: 0/);
  });
  it("smart view on the phone is excluded from the fit rules", () => {
    const fit = css.slice(css.indexOf("/* TV view: the whole screen"), css.indexOf(".tv-top {"));
    const selectors = [...fit.matchAll(/^([^\s/}][^{}]*)\{/gm)].map((m) => m[1].trim());
    assert.ok(selectors.length >= 4);
    for (const sel of selectors) assert.match(sel, /^\.tv-screen:not\(\.smart-view-captions\)/);
  });
});
