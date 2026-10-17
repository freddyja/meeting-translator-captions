import { checkAuth, signalAuthRequired, wsAuthQuery } from "../auth.ts";
import {
  emptyFloor,
  type ConnStatus,
  type FloorState,
  type PeerCounts,
  type Role,
  type RoomState,
} from "../types.ts";
import { createFloorRequests, type FloorReply } from "./floor-requests.ts";
import { CLIENT_PING_MS, PONG_TIMEOUT_MS, backoffMs, downStatus, shouldReclaim } from "./reconnect.ts";

export type FloorNotice = {
  ok?: boolean;
  reason?: string;
  action?: string;
};

export type RoomConnection = {
  push(state: RoomState): void;
  claimFloor(name?: string): Promise<boolean>;
  releaseFloor(): Promise<boolean>;
  forceRelease(): Promise<boolean>;
  /** Probe the socket now (tab became visible, network came back). */
  check(): void;
  close(): void;
};

const FLOOR_TIMEOUT_MS = 2500;

export function connectRoom(opts: {
  room: string;
  role: Role;
  name?: string;
  onState: (state: RoomState) => void;
  onPeers: (peers: PeerCounts) => void;
  onStatus: (status: ConnStatus) => void;
  onJoined?: (info: { peerId: string; floor: FloorState }) => void;
  onFloor?: (floor: FloorState, notice?: FloorNotice) => void;
  /**
   * Asked on reconnect when we held the floor at the drop. Return false to let
   * it go (a guest whose Type + Send claim is idle). Omitted means reclaim (host).
   */
  keepFloorOnReconnect?: () => boolean;
}): RoomConnection {
  let ws: WebSocket | null = null;
  let closed = false;
  let failures = 0;
  let everJoined = false;
  let retryTimer = 0;
  let pingTimer = 0;
  let pongTimer = 0;

  let queued: RoomState | null = null;
  let floor: FloorState = emptyFloor();
  let peerId: string | null = null;
  let resumeToken: string | null = null;
  /** Set when the socket drops while we hold the floor. */
  let reclaimOnOpen = false;
  let name = opts.name;
  const requests = createFloorRequests();

  const isOpen = () => ws?.readyState === WebSocket.OPEN;

  const flush = () => {
    if (queued && isOpen()) {
      ws?.send(JSON.stringify({ type: "push", state: queued }));
    }
  };

  const sendFloor = (action: "claim" | "release" | "force", nameOverride?: string): Promise<boolean> => {
    if (typeof nameOverride === "string") name = nameOverride;
    return new Promise((resolve) => {
      if (closed) {
        resolve(false);
        return;
      }
      let timer = 0;
      const id = requests.open((reply: FloorReply) => {
        window.clearTimeout(timer);
        resolve(reply.ok === true);
      });
      timer = window.setTimeout(() => {
        requests.cancel(id);
        resolve(false);
      }, FLOOR_TIMEOUT_MS);
      if (isOpen()) {
        ws?.send(JSON.stringify({ type: "floor", action, name: nameOverride ?? name, requestId: id }));
      }
    });
  };

  const stopHeartbeat = () => {
    window.clearInterval(pingTimer);
    window.clearTimeout(pongTimer);
    pingTimer = 0;
    pongTimer = 0;
  };

  const ping = () => {
    if (!isOpen() || pongTimer) return;
    try {
      ws?.send(JSON.stringify({ type: "ping", t: Date.now() }));
    } catch {
      drop();
      return;
    }
    pongTimer = window.setTimeout(() => {
      pongTimer = 0;
      // Half-open socket (phone slept, Wi-Fi changed). Do not wait for onclose.
      drop(true);
    }, PONG_TIMEOUT_MS);
  };

  const heard = () => {
    window.clearTimeout(pongTimer);
    pongTimer = 0;
  };

  /** The socket is gone (or presumed gone). Remember the floor, report, and retry. */
  const drop = (fast = false) => {
    const dead = ws;
    ws = null;
    stopHeartbeat();
    if (dead) {
      dead.onopen = null;
      dead.onmessage = null;
      dead.onclose = null;
      dead.onerror = null;
      try {
        dead.close();
      } catch {
        /* already closed */
      }
    }
    if (closed) return;
    if (shouldReclaim(floor, peerId)) reclaimOnOpen = true;
    // Pending floor requests can never be answered by the dead socket.
    requests.failAll({ type: "floor", ok: false, reason: "offline" });
    failures += 1;
    opts.onStatus(downStatus(failures, everJoined));
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(open, fast ? 250 : backoffMs(failures));
  };

  const open = () => {
    if (closed) return;
    window.clearTimeout(retryTimer);
    if (!everJoined && failures === 0) opts.onStatus("connecting");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    let sock: WebSocket;
    try {
      sock = new WebSocket(`${proto}//${location.host}/caption-ws${wsAuthQuery()}`);
    } catch {
      drop();
      return;
    }
    ws = sock;
    let opened = false;
    // Never opened: maybe the PIN gate refused the upgrade (browsers hide the 401).
    const probeAuth = () => {
      if (opened || failures < 1) return;
      void checkAuth().then((status) => {
        if (status?.required && !status.ok) signalAuthRequired();
      });
    };

    sock.onopen = () => {
      if (sock !== ws) return;
      opened = true;
      const held = reclaimOnOpen;
      reclaimOnOpen = false;
      const reclaim = held && (opts.keepFloorOnReconnect?.() ?? true);
      // Letting the floor go: a stale listening:true push must not grab it back.
      if (held && !reclaim && queued?.listening) queued = { ...queued, listening: false };
      // `resume` lets the relay retire our previous (possibly half-open) socket
      // at once; `reclaim` asks it to hand that socket's floor to this one.
      sock.send(
        JSON.stringify({
          type: "join",
          room: opts.room,
          role: opts.role,
          name,
          resume: resumeToken ?? undefined,
          reclaim: reclaim || undefined,
        }),
      );
      // Claim the speaking turn again BEFORE flushing the queued push.
      // Otherwise the relay sees listening:true from a peer with no floor.
      if (reclaim) void sendFloor("claim");
      flush();
      stopHeartbeat();
      pingTimer = window.setInterval(ping, CLIENT_PING_MS);
    };

    sock.onmessage = (event) => {
      if (sock !== ws) return;
      heard();
      let msg: {
        type: string;
        state?: RoomState;
        phones?: number;
        tvs?: number;
        guests?: number;
        peerId?: string;
        resumeToken?: string;
        floor?: FloorState;
        ok?: boolean;
        reason?: string;
        action?: string;
        requestId?: number;
      };
      try {
        msg = JSON.parse(String(event.data)) as typeof msg;
      } catch {
        return;
      }
      if (msg.type === "pong") return;
      if (msg.type === "state" && msg.state) {
        if (msg.state.floor) floor = msg.state.floor;
        opts.onState(msg.state);
      }
      if (msg.type === "peers" || msg.type === "joined") {
        opts.onPeers({
          phones: msg.phones ?? 0,
          tvs: msg.tvs ?? 0,
          guests: msg.guests ?? 0,
        });
      }
      if (msg.type === "joined") {
        failures = 0;
        everJoined = true;
        if (msg.floor) floor = msg.floor;
        if (msg.peerId) peerId = msg.peerId;
        if (msg.resumeToken) resumeToken = msg.resumeToken;
        opts.onStatus("live");
        if (msg.peerId) opts.onJoined?.({ peerId: msg.peerId, floor: msg.floor ?? floor });
      }
      if (msg.type === "floor") {
        if (msg.floor) floor = msg.floor;
        const notice: FloorNotice = { ok: msg.ok, reason: msg.reason, action: msg.action };
        opts.onFloor?.(floor, notice);
        requests.settle(msg);
      }
    };

    sock.onclose = () => {
      if (sock !== ws) return;
      probeAuth();
      drop();
    };

    sock.onerror = () => {
      if (sock !== ws) return;
      probeAuth();
      drop();
    };
  };

  /** Visible again or back online: reconnect now, or prove the open socket still works. */
  const check = () => {
    if (closed) return;
    if (!ws) {
      window.clearTimeout(retryTimer);
      open();
      return;
    }
    if (isOpen()) ping();
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") check();
  };
  const onOnline = () => check();
  const onOffline = () => {
    // The OS says the network is gone. Show it now, and let the ping prove it.
    if (isOpen()) ping();
    else opts.onStatus(downStatus(Math.max(1, failures), everJoined));
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  open();

  return {
    push(state) {
      queued = state;
      flush();
    },
    claimFloor(nextName?: string) {
      return sendFloor("claim", nextName);
    },
    releaseFloor() {
      reclaimOnOpen = false;
      return sendFloor("release");
    },
    forceRelease() {
      return sendFloor("force");
    },
    check,
    close() {
      closed = true;
      window.clearTimeout(retryTimer);
      stopHeartbeat();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      requests.failAll({ type: "floor", ok: false, reason: "closed" });
      const dead = ws;
      ws = null;
      dead?.close();
    },
  };
}
