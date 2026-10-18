import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";
import { attachCaptionRelay, sanitizeCaptionLines } from "../server/relay.ts";
import { MAX_LINES } from "../src/types.ts";

type Msg = Record<string, any>;

let server: Server;
let base = "";
let roomSeq = 0;

before(async () => {
  server = createServer();
  attachCaptionRelay(server, { heartbeatMs: 150 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/caption-ws`;
});

after(() => {
  server.closeAllConnections?.();
  server.close();
});

function nextRoom(): string {
  roomSeq += 1;
  return `R${"ABCDEFGH"[roomSeq % 8]}${"23456789"[Math.floor(roomSeq / 8) % 8]}Z`;
}

class Peer {
  ws: WebSocket;
  inbox: Msg[] = [];
  private waiters: Array<{ match: (m: Msg) => boolean; done: (m: Msg) => void }> = [];
  constructor(opts: { autoPong?: boolean } = {}) {
    this.ws = new WebSocket(base, { autoPong: opts.autoPong ?? true });
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw)) as Msg;
      const i = this.waiters.findIndex((w) => w.match(msg));
      if (i >= 0) this.waiters.splice(i, 1)[0].done(msg);
      else this.inbox.push(msg);
    });
  }
  async open() {
    if (this.ws.readyState !== WebSocket.OPEN) await once(this.ws, "open");
    return this;
  }
  send(msg: Msg) {
    this.ws.send(JSON.stringify(msg));
  }
  next(match: (m: Msg) => boolean, ms = 1500): Promise<Msg> {
    const i = this.inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for message")), ms);
      this.waiters.push({ match, done: (m) => (clearTimeout(timer), resolve(m)) });
    });
  }
  async join(room: string, role: string, name: string, extra: Msg = {}) {
    await this.open();
    this.send({ type: "join", room, role, name, ...extra });
    return this.next((m) => m.type === "joined");
  }
  close() {
    this.ws.terminate();
  }
}

describe("relay floor replies", () => {
  it("echoes requestId and action, and answers each request in order", async () => {
    const room = nextRoom();
    const host = new Peer();
    const guest = new Peer();
    const h = await host.join(room, "phone", "Host");
    await guest.join(room, "guest", "Ana");

    guest.send({ type: "floor", action: "claim", requestId: 7 });
    const ok = await guest.next((m) => m.type === "floor" && m.requestId === 7);
    assert.equal(ok.ok, true);
    assert.equal(ok.action, "claim");

    host.send({ type: "floor", action: "claim", requestId: 3 });
    const busy = await host.next((m) => m.type === "floor" && m.requestId === 3);
    assert.equal(busy.ok, false);
    assert.equal(busy.reason, "busy");
    assert.notEqual(busy.floor.holderId, h.peerId);
    host.close();
    guest.close();
  });

  it("an unsolicited busy notice from a push carries no requestId", async () => {
    const room = nextRoom();
    const host = new Peer();
    const guest = new Peer();
    await host.join(room, "phone", "Host");
    await guest.join(room, "guest", "Ana");
    guest.send({ type: "floor", action: "claim", requestId: 1 });
    await guest.next((m) => m.requestId === 1);
    host.send({ type: "push", state: { listening: true, lines: [] } });
    const notice = await host.next((m) => m.type === "floor" && m.ok === false);
    assert.equal(notice.requestId, undefined);
    host.close();
    guest.close();
  });
});

describe("applyPush broadcasts the floor", () => {
  it("a listening:true push that takes a free floor tells every peer, sender included", async () => {
    const room = nextRoom();
    const host = new Peer();
    const tv = new Peer();
    const h = await host.join(room, "phone", "Host");
    await tv.join(room, "tv", "TV");
    host.send({ type: "push", state: { listening: true, lines: [] } });
    const mine = await host.next((m) => m.type === "floor" && m.floor?.holderId === h.peerId);
    const theirs = await tv.next((m) => m.type === "floor" && m.floor?.holderId === h.peerId);
    assert.equal(mine.floor.holderName, "Host");
    assert.equal(theirs.floor.holderName, "Host");
    host.close();
    tv.close();
  });
});

describe("reconnect / resume", () => {
  it("resume + reclaim hands the old socket's floor to the new one and retires it", async () => {
    const room = nextRoom();
    const first = new Peer();
    const other = new Peer();
    const j1 = await first.join(room, "guest", "Ana");
    assert.ok(j1.resumeToken, "joined carries a resume token");
    await other.join(room, "phone", "Host");
    first.send({ type: "floor", action: "claim", requestId: 1 });
    await first.next((m) => m.requestId === 1 && m.ok === true);

    // Same phone, new socket, before the old one has timed out.
    const second = new Peer();
    const closed = once(first.ws, "close");
    const j2 = await second.join(room, "guest", "Ana", { resume: j1.resumeToken, reclaim: true });
    assert.equal(j2.floor.holderId, j2.peerId, "floor moved to the new socket at join");
    await closed;
    const seen = await other.next((m) => m.type === "floor" && m.floor?.holderId === j2.peerId);
    assert.equal(seen.floor.holderName, "Ana");

    // Re-claim before flush is idempotent, then the queued push is a caption.
    second.send({ type: "floor", action: "claim", requestId: 1 });
    second.send({
      type: "push",
      state: { listening: true, lines: [{ id: "a", isFinal: true, text: { es: "hola" }, at: 1 }] },
    });
    const claim = await second.next((m) => m.requestId === 1);
    assert.equal(claim.ok, true);
    const state = await other.next((m) => m.type === "state" && m.state.lines.length === 1);
    assert.equal(state.state.lines[0].text.es, "hola");
    assert.equal(state.state.floor.holderId, j2.peerId);
    second.close();
    other.close();
  });

  it("resume without reclaim frees the floor instead of keeping it", async () => {
    const room = nextRoom();
    const first = new Peer();
    const other = new Peer();
    const j1 = await first.join(room, "guest", "Ana");
    await other.join(room, "phone", "Host");
    first.send({ type: "floor", action: "claim", requestId: 1 });
    await first.next((m) => m.requestId === 1);
    const second = new Peer();
    const j2 = await second.join(room, "guest", "Ana", { resume: j1.resumeToken });
    assert.equal(j2.floor.holderId, null);
    await other.next((m) => m.type === "floor" && m.floor?.holderId === null);
    second.close();
    other.close();
  });

  it("an unknown or other-room resume token changes nothing", async () => {
    const room = nextRoom();
    const holder = new Peer();
    const jh = await holder.join(room, "guest", "Ana");
    holder.send({ type: "floor", action: "claim", requestId: 1 });
    await holder.next((m) => m.requestId === 1);
    const stranger = new Peer();
    const js = await stranger.join(room, "guest", "Bo", { resume: "not-a-token", reclaim: true });
    assert.equal(js.floor.holderId, jh.peerId);
    holder.close();
    stranger.close();
  });
});

describe("heartbeat", () => {
  it("answers an app-level ping with pong, before or after join", async () => {
    const peer = await new Peer().open();
    peer.send({ type: "ping", t: 42 });
    const pong = await peer.next((m) => m.type === "pong");
    assert.equal(pong.t, 42);
    peer.close();
  });

  it("terminates a socket that stops answering protocol pings and frees its floor", async () => {
    const room = nextRoom();
    const dead = new Peer({ autoPong: false });
    const watcher = new Peer();
    const jd = await dead.join(room, "guest", "Ana");
    await watcher.join(room, "phone", "Host");
    dead.send({ type: "floor", action: "claim", requestId: 1 });
    await dead.next((m) => m.requestId === 1);
    const closed = once(dead.ws, "close");
    await closed; // two missed 150 ms heartbeats
    const freed = await watcher.next((m) => m.type === "floor" && m.floor?.holderId === null, 2000);
    assert.notEqual(freed.floor.holderId, jd.peerId);
    watcher.close();
  });

  it("keeps a socket that answers pings", async () => {
    const room = nextRoom();
    const alive = new Peer();
    await alive.join(room, "tv", "TV");
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(alive.ws.readyState, WebSocket.OPEN);
    alive.close();
  });
});

function finalLine(n: number) {
  return { id: `l${n}`, isFinal: true, text: { en: `line ${n}`, es: `línea ${n}`, pt: `linha ${n}` }, at: n, speaker: "Host" };
}

describe("late joiner backlog", () => {
  it("a guest who joins late receives the last 8 caption lines in its first state", async () => {
    assert.equal(MAX_LINES, 8);
    const room = nextRoom();
    const host = new Peer();
    const tv = new Peer();
    await host.join(room, "phone", "Host");
    await tv.join(room, "tv", "TV");
    // Push 12 finals one by one. Each push carries the whole history (untrimmed,
    // as an old or misbehaving client might), so the relay itself must cap it.
    const history = [];
    for (let n = 1; n <= 12; n += 1) {
      history.push(finalLine(n));
      host.send({ type: "push", state: { listening: true, sourceLang: "en", lines: [...history] } });
    }
    const seen = await tv.next((m) => m.type === "state" && m.state.lines.at(-1)?.id === "l12");
    assert.equal(seen.state.lines.length, MAX_LINES, "peers see at most MAX_LINES too");

    const late = new Peer();
    const joined = await late.join(room, "guest", "Late");
    assert.ok(joined.peerId);
    const first = await late.next((m) => m.type === "state");
    assert.deepEqual(
      first.state.lines.map((line: Msg) => line.id),
      ["l5", "l6", "l7", "l8", "l9", "l10", "l11", "l12"],
    );
    assert.equal(first.state.lines[0].text.es, "línea 5");
    assert.equal(first.state.lines[7].speaker, "Host");
    host.close();
    tv.close();
    late.close();
  });
});

describe("sanitizeCaptionLines cap", () => {
  it("keeps the last MAX_LINES finals in order", () => {
    const rows = Array.from({ length: 11 }, (_, i) => finalLine(i + 1));
    const kept = sanitizeCaptionLines(rows) as Msg[];
    assert.deepEqual(kept.map((r) => r.id), ["l4", "l5", "l6", "l7", "l8", "l9", "l10", "l11"]);
  });

  it("keeps a trailing interim on top of the 8 finals, but drops stray interims earlier on", () => {
    const rows: Msg[] = Array.from({ length: 9 }, (_, i) => finalLine(i + 1));
    rows.splice(3, 0, { id: "stray", isFinal: false, text: { en: "uh" }, at: 0 });
    rows.push({ id: "live", isFinal: false, text: { en: "still talk" }, at: 99 });
    const kept = sanitizeCaptionLines(rows) as Msg[];
    assert.deepEqual(kept.map((r) => r.id), ["l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9", "live"]);
    assert.equal(kept.at(-1)?.isFinal, false);
  });

  it("leaves short histories alone", () => {
    const rows = [finalLine(1), finalLine(2)];
    assert.equal((sanitizeCaptionLines(rows) as Msg[]).length, 2);
    assert.deepEqual(sanitizeCaptionLines(null), []);
  });
});
