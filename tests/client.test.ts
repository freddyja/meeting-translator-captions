import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

// Minimal browser surface for src/realtime/client.ts.
type Listener = (event?: unknown) => void;
const docListeners = new Map<string, Set<Listener>>();
const winListeners = new Map<string, Set<Listener>>();
const on = (map: Map<string, Set<Listener>>) => (type: string, fn: Listener) => {
  if (!map.has(type)) map.set(type, new Set());
  map.get(type)!.add(fn);
};
const off = (map: Map<string, Set<Listener>>) => (type: string, fn: Listener) => map.get(type)?.delete(fn);
const fire = (map: Map<string, Set<Listener>>, type: string) => {
  for (const fn of map.get(type) ?? []) fn();
};

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  sent: Record<string, any>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = FakeSocket.CLOSED;
  }
  // test helpers
  accept() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  receive(msg: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop() {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}

const g = globalThis as any;
g.window = {
  setTimeout: (...a: any[]) => g.setTimeout(...a),
  clearTimeout: (...a: any[]) => g.clearTimeout(...a),
  setInterval: (...a: any[]) => g.setInterval(...a),
  clearInterval: (...a: any[]) => g.clearInterval(...a),
  addEventListener: on(winListeners),
  removeEventListener: off(winListeners),
};
g.document = { visibilityState: "visible", addEventListener: on(docListeners), removeEventListener: off(docListeners) };
g.location = { protocol: "https:", host: "captions.test" };
g.WebSocket = FakeSocket;

const { connectRoom } = await import("../src/realtime/client.ts");
const { PONG_TIMEOUT_MS } = await import("../src/realtime/reconnect.ts");

const latest = () => FakeSocket.all.at(-1)!;
const floorOf = (holderId: string | null) => ({ holderId, holderName: holderId ? "Ana" : null });
const flushMicrotasks = () => new Promise<void>((r) => setImmediate(r));

function connect(statuses: string[] = []) {
  return connectRoom({
    room: "ABCD",
    role: "guest",
    name: "Ana",
    onState: () => {},
    onPeers: () => {},
    onStatus: (s) => statuses.push(s),
  });
}

beforeEach(() => {
  FakeSocket.all = [];
  docListeners.clear();
  winListeners.clear();
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
});
afterEach(() => mock.timers.reset());

describe("connectRoom reconnect", () => {
  it("re-claims the floor before flushing the queued push on reconnect", async () => {
    const statuses: string[] = [];
    const conn = connect(statuses);
    const s1 = latest();
    s1.accept();
    s1.receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf(null) });
    const claimed = conn.claimFloor("Ana");
    const req = s1.sent.find((m) => m.type === "floor")!;
    s1.receive({ type: "floor", ok: true, requestId: req.requestId, floor: floorOf("p1") });
    assert.equal(await claimed, true);
    conn.push({ room: "ABCD", layout: "en", sourceLang: "es", listening: true, lines: [], floor: floorOf("p1") });

    s1.drop();
    assert.equal(statuses.at(-1), "offline");
    mock.timers.tick(10_000);
    const s2 = latest();
    assert.notEqual(s2, s1);
    s2.accept();
    assert.deepEqual(
      s2.sent.map((m) => m.type),
      ["join", "floor", "push"],
      "claim goes out before the flushed push",
    );
    assert.equal(s2.sent[0].resume, "t1");
    assert.equal(s2.sent[0].reclaim, true);
    assert.equal(s2.sent[1].action, "claim");
    s2.receive({ type: "joined", peerId: "p2", resumeToken: "t2", floor: floorOf("p2") });
    assert.equal(statuses.at(-1), "live");
    conn.close();
  });

  it("does not reclaim after the user released the floor while offline", () => {
    const conn = connect();
    const s1 = latest();
    s1.accept();
    s1.receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf("p1") });
    s1.drop();
    void conn.releaseFloor();
    mock.timers.tick(10_000);
    const s2 = latest();
    s2.accept();
    assert.equal(s2.sent[0].reclaim, undefined);
    assert.ok(!s2.sent.some((m) => m.type === "floor" && m.action === "claim"));
    conn.close();
  });
});

describe("connectRoom guest floor on reconnect", () => {
  function guest(keep: () => boolean) {
    return connectRoom({
      room: "ABCD",
      role: "guest",
      name: "Ana",
      onState: () => {},
      onPeers: () => {},
      onStatus: () => {},
      keepFloorOnReconnect: keep,
    });
  }
  const typed = { room: "ABCD", layout: "en" as const, sourceLang: "es" as const, listening: true, lines: [], floor: floorOf("p1") };

  it("an idle Type + Send claim is released: no reclaim, and the stale push cannot re-grab it", () => {
    const conn = guest(() => false);
    const s1 = latest();
    s1.accept();
    s1.receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf("p1") });
    conn.push(typed);
    s1.drop();
    mock.timers.tick(10_000);
    const s2 = latest();
    s2.accept();
    assert.deepEqual(s2.sent.map((m) => m.type), ["join", "push"]);
    assert.equal(s2.sent[0].resume, "t1", "still retires the old socket");
    assert.equal(s2.sent[0].reclaim, undefined);
    assert.equal(s2.sent[1].state.listening, false);
    conn.close();
  });

  it("a guest actively sending keeps the floor", () => {
    const conn = guest(() => true);
    const s1 = latest();
    s1.accept();
    s1.receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf("p1") });
    conn.push(typed);
    s1.drop();
    mock.timers.tick(10_000);
    const s2 = latest();
    s2.accept();
    assert.deepEqual(s2.sent.map((m) => m.type), ["join", "floor", "push"]);
    assert.equal(s2.sent[0].reclaim, true);
    assert.equal(s2.sent[2].state.listening, true);
    conn.close();
  });

  it("the decision is made at reconnect time, not at the drop", () => {
    let sending = true;
    const conn = guest(() => sending);
    const s1 = latest();
    s1.accept();
    s1.receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf("p1") });
    s1.drop();
    sending = false; // the in-flight caption finished while offline
    mock.timers.tick(10_000);
    latest().accept();
    assert.equal(latest().sent[0].reclaim, undefined);
    conn.close();
  });
});

describe("connectRoom floor request ids", () => {
  it("matches replies to requests by id, even out of order, and ignores unsolicited notices", async () => {
    const conn = connect();
    const s = latest();
    s.accept();
    s.receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf(null) });
    const results: string[] = [];
    void conn.claimFloor("Ana").then((ok) => results.push(`claim:${ok}`));
    void conn.releaseFloor().then((ok) => results.push(`release:${ok}`));
    const [claim, release] = s.sent.filter((m) => m.type === "floor");
    assert.notEqual(claim.requestId, release.requestId);

    // A busy notice from a push (no requestId) must not settle anything.
    s.receive({ type: "floor", ok: false, reason: "busy", action: "claim", floor: floorOf("x") });
    await flushMicrotasks();
    assert.deepEqual(results, []);

    s.receive({ type: "floor", ok: true, requestId: release.requestId, floor: floorOf(null) });
    s.receive({ type: "floor", ok: false, reason: "busy", requestId: claim.requestId, floor: floorOf("x") });
    await flushMicrotasks();
    assert.deepEqual(results, ["release:true", "claim:false"]);
    conn.close();
  });

  it("fails pending requests at once when the socket drops", async () => {
    const conn = connect();
    const s = latest();
    s.accept();
    s.receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf(null) });
    const pending = conn.claimFloor("Ana");
    s.drop();
    assert.equal(await pending, false);
    conn.close();
  });
});

describe("connectRoom liveness checks", () => {
  it("visibilitychange pings, and a missing pong forces a fast reconnect", () => {
    const conn = connect();
    const s1 = latest();
    s1.accept();
    s1.receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf(null) });
    fire(docListeners, "visibilitychange");
    assert.equal(s1.sent.at(-1)?.type, "ping");
    mock.timers.tick(PONG_TIMEOUT_MS);
    assert.equal(FakeSocket.all.length, 1, "retry waits a beat");
    mock.timers.tick(300);
    assert.equal(FakeSocket.all.length, 2, "reconnected without waiting for onclose");
    conn.close();
  });

  it("a pong (any message) keeps the socket", () => {
    const conn = connect();
    const s1 = latest();
    s1.accept();
    s1.receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf(null) });
    fire(winListeners, "online");
    s1.receive({ type: "pong" });
    mock.timers.tick(PONG_TIMEOUT_MS * 2);
    assert.equal(FakeSocket.all.length, 1);
    conn.close();
  });

  it("online with no socket reconnects immediately instead of waiting out the backoff", () => {
    const conn = connect();
    latest().accept();
    latest().receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf(null) });
    latest().drop();
    assert.equal(FakeSocket.all.length, 1);
    fire(winListeners, "online");
    assert.equal(FakeSocket.all.length, 2);
    conn.close();
  });

  it("reports 'waking' when the first connects keep failing (Render cold start)", () => {
    const statuses: string[] = [];
    const conn = connect(statuses);
    assert.equal(statuses[0], "connecting");
    latest().drop();
    mock.timers.tick(10_000);
    latest().drop();
    assert.equal(statuses.at(-1), "waking");
    mock.timers.tick(10_000);
    latest().accept();
    latest().receive({ type: "joined", peerId: "p1", resumeToken: "t1", floor: floorOf(null) });
    assert.equal(statuses.at(-1), "live");
    // After a successful join, a drop is a plain reconnect, not a cold start.
    latest().drop();
    mock.timers.tick(10_000);
    latest().drop();
    assert.equal(statuses.at(-1), "offline");
    conn.close();
  });
});
