import {
  emptyFloor,
  type ConnStatus,
  type FloorState,
  type PeerCounts,
  type Role,
  type RoomState,
} from "../types";

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
  close(): void;
};

type FloorWire = {
  type: string;
  ok?: boolean;
  reason?: string;
  action?: string;
  floor?: FloorState;
};

export function connectRoom(opts: {
  room: string;
  role: Role;
  name?: string;
  onState: (state: RoomState) => void;
  onPeers: (peers: PeerCounts) => void;
  onStatus: (status: ConnStatus) => void;
  onJoined?: (info: { peerId: string; floor: FloorState }) => void;
  onFloor?: (floor: FloorState, notice?: FloorNotice) => void;
}): RoomConnection {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer = 0;

  let queued: RoomState | null = null;
  let floor: FloorState = emptyFloor();
  const waiters: Array<(msg: FloorWire) => void> = [];

  const flush = () => {
    if (queued && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "push", state: queued }));
    }
  };

  const sendFloor = (action: "claim" | "release" | "force", name?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const finish = (ok: boolean) => resolve(ok);
      if (closed) {
        finish(false);
        return;
      }
      const timer = window.setTimeout(() => {
        const index = waiters.indexOf(onResult);
        if (index >= 0) waiters.splice(index, 1);
        finish(false);
      }, 2500);
      const onResult = (msg: FloorWire) => {
        window.clearTimeout(timer);
        finish(msg.ok === true);
      };
      waiters.push(onResult);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "floor", action, name: name ?? opts.name }));
      }
    });
  };

  const open = () => {
    if (closed) return;
    opts.onStatus("connecting");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/caption-ws`);

    ws.onopen = () => {
      attempt = 0;
      ws?.send(
        JSON.stringify({
          type: "join",
          room: opts.room,
          role: opts.role,
          name: opts.name,
        }),
      );
      opts.onStatus("live");
      flush();
    };

    ws.onmessage = (event) => {
      let msg: {
        type: string;
        state?: RoomState;
        phones?: number;
        tvs?: number;
        guests?: number;
        peerId?: string;
        floor?: FloorState;
        ok?: boolean;
        reason?: string;
        action?: string;
      };
      try {
        msg = JSON.parse(String(event.data)) as typeof msg;
      } catch {
        return;
      }
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
        if (msg.floor) floor = msg.floor;
        if (msg.peerId) opts.onJoined?.({ peerId: msg.peerId, floor: msg.floor ?? floor });
      }
      if (msg.type === "floor") {
        if (msg.floor) floor = msg.floor;
        const notice: FloorNotice = { ok: msg.ok, reason: msg.reason, action: msg.action };
        opts.onFloor?.(floor, notice);
        if (typeof msg.ok === "boolean") {
          const waiter = waiters.shift();
          waiter?.(msg);
        }
      }
    };

    ws.onclose = () => {
      opts.onStatus("offline");
      scheduleRetry();
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  const scheduleRetry = () => {
    if (closed) return;
    attempt += 1;
    const ms = Math.min(8000, 300 * 2 ** attempt);
    retryTimer = window.setTimeout(open, ms);
  };

  open();

  return {
    push(state) {
      queued = state;
      flush();
    },
    claimFloor(name?: string) {
      return sendFloor("claim", name);
    },
    releaseFloor() {
      return sendFloor("release");
    },
    forceRelease() {
      return sendFloor("force");
    },
    close() {
      closed = true;
      window.clearTimeout(retryTimer);
      while (waiters.length) waiters.shift()?.({ type: "floor", ok: false, reason: "closed" });
      ws?.close();
      ws = null;
    },
  };
}
