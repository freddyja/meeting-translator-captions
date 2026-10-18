import assert from "node:assert/strict";
import { test } from "node:test";
import { micUi, shouldReleaseTypedFloor } from "../src/mic-ui.ts";

test("Type + Send never looks like the mic is on (holding the floor without a live mic)", () => {
  // Typed message posted: this phone holds the floor, but no microphone session runs.
  const typed = micUi({ holding: true, micLive: false, blocked: false });
  assert.equal(typed.hot, false, "mic button must not glow");
  assert.equal(typed.listening, false, "status must not say Listening / You're speaking");
  assert.equal(typed.label, "start", "button must still read Tap to talk, not Stop");
});

test("live mic: hot, listening, Stop", () => {
  assert.deepEqual(micUi({ holding: true, micLive: true, blocked: false }), { hot: true, listening: true, label: "stop" });
});

test("someone else speaking: Wait, never hot", () => {
  assert.deepEqual(micUi({ holding: false, micLive: false, blocked: true }), { hot: false, listening: false, label: "wait" });
  // A stale local mic flag without the floor is not listening either.
  assert.equal(micUi({ holding: false, micLive: true, blocked: false }).listening, false);
});

test("typed floor is handed back once posting is done, never while the mic is live", () => {
  assert.equal(shouldReleaseTypedFloor({ holding: true, micLive: false, publishing: 0 }), true);
  assert.equal(shouldReleaseTypedFloor({ holding: true, micLive: false, publishing: 1 }), false, "more typed messages in flight");
  assert.equal(shouldReleaseTypedFloor({ holding: true, micLive: true, publishing: 0 }), false, "live mic keeps the floor");
  assert.equal(shouldReleaseTypedFloor({ holding: false, micLive: false, publishing: 0 }), false, "nothing to release");
});
