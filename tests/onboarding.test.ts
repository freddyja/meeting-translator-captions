import assert from "node:assert/strict";
import { test } from "node:test";
import { HAPTIC_SELECTOR, hapticMode } from "../src/haptics.ts";
import { installPlatform, shouldShowInstallBanner, shouldShowTour, tourCards } from "../src/onboarding.ts";

const base = { view: "home", standalone: false, dismissed: false, platform: "ios" as const, tourOpen: false, meetingUsed: true };

test("install banner: iOS guide or Android prompt, front screen only", () => {
  assert.equal(installPlatform({ appleMobile: true, canPrompt: false }), "ios");
  assert.equal(installPlatform({ appleMobile: false, canPrompt: true }), "prompt");
  assert.equal(installPlatform({ appleMobile: false, canPrompt: false }), "none");
  assert.equal(shouldShowInstallBanner(base), true);
  assert.equal(shouldShowInstallBanner({ ...base, platform: "prompt" }), true);
  for (const view of ["tv", "phone", "join", "talk", "photo"]) {
    assert.equal(shouldShowInstallBanner({ ...base, view }), false, view);
  }
  assert.equal(shouldShowInstallBanner({ ...base, standalone: true }), false);
  assert.equal(shouldShowInstallBanner({ ...base, dismissed: true }), false);
  assert.equal(shouldShowInstallBanner({ ...base, tourOpen: true }), false);
  assert.equal(shouldShowInstallBanner({ ...base, platform: "none" }), false);
});

test("install banner: never on the first visit, only after a meeting was used once", () => {
  assert.equal(shouldShowInstallBanner({ ...base, meetingUsed: false }), false);
  assert.equal(shouldShowInstallBanner({ ...base, platform: "prompt", meetingUsed: false }), false);
  assert.equal(shouldShowInstallBanner({ ...base, meetingUsed: true }), true);
});

test("walkthrough: PIN card skipped once the PIN was entered (or none is needed)", () => {
  assert.deepEqual(tourCards({ pinHandled: false }), ["captions", "create", "pin", "tv"]);
  assert.deepEqual(tourCards({ pinHandled: true }), ["captions", "create", "tv"]);
});

test("tour: once, front screen only", () => {
  assert.equal(shouldShowTour({ view: "home", done: false }), true);
  assert.equal(shouldShowTour({ view: "home", done: true }), false);
  assert.equal(shouldShowTour({ view: "tv", done: false }), false);
  assert.equal(shouldShowTour({ view: "join", done: false }), false);
});

test("haptics: vibrate, iOS switch, or off with the setting / reduced motion", () => {
  const on = { enabled: true, reducedMotion: false, hasVibrate: false, appleMobile: false, switchSupported: false };
  assert.equal(hapticMode({ ...on, hasVibrate: true }), "vibrate");
  assert.equal(hapticMode({ ...on, appleMobile: true, switchSupported: true }), "ios-switch");
  assert.equal(hapticMode({ ...on, appleMobile: true }), "off");
  assert.equal(hapticMode({ ...on, hasVibrate: true, enabled: false }), "off");
  assert.equal(hapticMode({ ...on, hasVibrate: true, reducedMotion: true }), "off");
  for (const sel of ["[data-mic]", "[data-swap]", "[data-create]", ".pin-key", "button[type=submit]"]) {
    assert.ok(HAPTIC_SELECTOR.includes(sel), sel);
  }
});
