import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFloorRequests } from "../src/realtime/floor-requests.ts";
import { backoffMs, downStatus, shouldReclaim } from "../src/realtime/reconnect.ts";
import { RECONNECTING, floorBusyCopy, isFloorNotice } from "../src/types.ts";

describe("floor requests", () => {
  it("settles only the matching id", () => {
    const r = createFloorRequests();
    const got: string[] = [];
    const a = r.open((m) => got.push(`a:${m.ok}`));
    const b = r.open((m) => got.push(`b:${m.ok}`));
    assert.equal(r.settle({ type: "floor", ok: true, requestId: b }), true);
    assert.equal(r.settle({ type: "floor", ok: false }), false, "no id: unsolicited");
    assert.equal(r.settle({ type: "floor", floor: undefined, requestId: a } as never), false, "broadcast has no ok");
    assert.equal(r.settle({ type: "floor", ok: false, requestId: a }), true);
    assert.equal(r.settle({ type: "floor", ok: true, requestId: a }), false, "already settled");
    assert.deepEqual(got, ["b:true", "a:false"]);
  });

  it("cancel and failAll", () => {
    const r = createFloorRequests();
    const got: string[] = [];
    const a = r.open(() => got.push("a"));
    r.open((m) => got.push(`b:${m.reason}`));
    r.cancel(a);
    r.failAll({ type: "floor", ok: false, reason: "offline" });
    assert.deepEqual(got, ["b:offline"]);
    assert.equal(r.size, 0);
  });
});

describe("reconnect helpers", () => {
  it("backoff grows, caps at ~8 s, and jitters ±15%", () => {
    assert.equal(backoffMs(1, () => 0.5), 600);
    assert.equal(backoffMs(2, () => 0.5), 1200);
    assert.equal(backoffMs(20, () => 0.5), 8000);
    assert.ok(backoffMs(20, () => 0) >= 6800 && backoffMs(20, () => 0.999) <= 9200);
  });

  it("down status", () => {
    assert.equal(downStatus(0, false), "connecting");
    assert.equal(downStatus(1, false), "offline");
    assert.equal(downStatus(2, false), "waking");
    assert.equal(downStatus(5, true), "offline");
  });

  it("reclaims only a floor we held", () => {
    assert.equal(shouldReclaim({ holderId: "p1", holderName: "Ana" }, "p1"), true);
    assert.equal(shouldReclaim({ holderId: "p2", holderName: "Bo" }, "p1"), false);
    assert.equal(shouldReclaim({ holderId: null, holderName: null }, "p1"), false);
    assert.equal(shouldReclaim({ holderId: "p1", holderName: "Ana" }, null), false);
  });
});

describe("floor copy while offline", () => {
  const other = { holderId: "p2", holderName: "Bo" };
  it("says Reconnecting… instead of blaming a speaker when not live", () => {
    assert.equal(floorBusyCopy("offline", other), RECONNECTING);
    assert.equal(floorBusyCopy("waking", other), RECONNECTING);
    assert.equal(floorBusyCopy("connecting", other), RECONNECTING);
    assert.equal(floorBusyCopy("live", other), "Someone else is speaking · Bo");
  });
  it("both notices clear once we hold the floor", () => {
    assert.equal(isFloorNotice(RECONNECTING), true);
    assert.equal(isFloorNotice("Someone else is speaking · Bo"), true);
    assert.equal(isFloorNotice("Microphone blocked."), false);
  });
});
