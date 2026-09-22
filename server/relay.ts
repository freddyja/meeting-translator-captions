import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";

type Role = "phone" | "tv" | "guest";

type Floor = {
  holderId: string | null;
  holderName: string | null;
};

type Client = {
  id: string;
  ws: WebSocket;
  room: string;
  role: Role;
  name: string;
};

type RoomState = Record<string, unknown>;

type Room = {
  clients: Set<Client>;
  state: RoomState | null;
  floor: Floor;
};

type Inbound =
  | { type: "join"; room: string; role?: string; name?: string }
  | { type: "push"; state: unknown }
  | { type: "floor"; action?: string; name?: string };

const LAYOUTS = new Set(["en", "es", "pt", "en-es", "en-pt", "es-pt", "en-es-pt"]);
const LANGS = new Set(["en", "es", "pt"]);

export type CaptionRelay = {
  roomCount(): number;
};

export function attachCaptionRelay(httpServer: Server | null): CaptionRelay {
  if (!httpServer) return { roomCount: () => 0 };

  const flagged = httpServer as Server & { __mtRelay?: CaptionRelay };
  if (flagged.__mtRelay) return flagged.__mtRelay;

  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map<string, Room>();
  const api: CaptionRelay = { roomCount: () => rooms.size };
  flagged.__mtRelay = api;

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = req.url ?? "";
    if (!url.startsWith("/caption-ws")) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    let client: Client | null = null;

    ws.on("message", (raw) => {
      let msg: Inbound;
      try {
        msg = JSON.parse(String(raw)) as Inbound;
      } catch {
        return;
      }

      if (msg.type === "join" && typeof msg.room === "string") {
        leave();
        const room = msg.room.trim().toUpperCase();
        if (!/^[A-Z2-9]{4}$/.test(room)) {
          send(ws, { type: "error", message: "Invalid room code" });
          return;
        }
        const role = parseRole(msg.role);
        let bucket = rooms.get(room);
        if (!bucket) {
          bucket = { clients: new Set(), state: null, floor: emptyFloor() };
          rooms.set(room, bucket);
        }
        client = {
          id: randomUUID(),
          ws,
          room,
          role,
          name: sanitizeName(msg.name, role === "phone" ? "Host" : "Guest"),
        };
        bucket.clients.add(client);
        const counts = peerCounts(bucket);
        send(ws, {
          type: "joined",
          room,
          peerId: client.id,
          role,
          floor: snapshotFloor(bucket.floor),
          ...counts,
        });
        if (bucket.state) {
          send(ws, { type: "state", state: withFloor(bucket.state, bucket.floor, client.room) });
        }
        broadcastPeers(bucket);
        return;
      }

      if (!client) return;
      const bucket = rooms.get(client.room);
      if (!bucket) return;

      if (msg.type === "floor") {
        if (typeof msg.name === "string") client.name = sanitizeName(msg.name, client.name);
        handleFloor(bucket, client, parseFloorAction(msg.action));
        return;
      }

      if (msg.type !== "push") return;
      applyPush(bucket, client, msg.state);
    });

    ws.on("close", leave);
    ws.on("error", leave);

    function leave() {
      if (!client) return;
      const bucket = rooms.get(client.room);
      if (bucket) {
        const leaving = client;
        bucket.clients.delete(leaving);
        if (bucket.floor.holderId === leaving.id) {
          bucket.floor = emptyFloor();
          if (bucket.state) {
            bucket.state = withFloor(
              { ...bucket.state, listening: false },
              bucket.floor,
              leaving.room,
            );
            broadcastState(bucket);
          }
          broadcastFloor(bucket);
        }
        if (bucket.clients.size === 0) rooms.delete(leaving.room);
        else broadcastPeers(bucket);
      }
      client = null;
    }
  });

  return api;
}

function handleFloor(bucket: Room, client: Client, action: "claim" | "release" | "force" | ""): void {
  if (!action) {
    sendFloorResult(client, false, "denied", bucket.floor);
    return;
  }

  if (action === "release") {
    if (!bucket.floor.holderId || bucket.floor.holderId === client.id) {
      bucket.floor = emptyFloor();
      patchListening(bucket, false);
      rememberFloor(bucket);
      sendFloorResult(client, true, undefined, bucket.floor);
      broadcastFloor(bucket);
      if (bucket.state) broadcastState(bucket, client.ws);
      return;
    }
    sendFloorResult(client, false, "denied", bucket.floor);
    return;
  }

  if (action === "force") {
    if (client.role !== "phone") {
      sendFloorResult(client, false, "denied", bucket.floor);
      return;
    }
    bucket.floor = { holderId: client.id, holderName: client.name };
    patchListening(bucket, false);
    rememberFloor(bucket);
    sendFloorResult(client, true, undefined, bucket.floor);
    broadcastFloor(bucket);
    if (bucket.state) broadcastState(bucket, client.ws);
    return;
  }

  if (action === "claim") {
    if (!bucket.floor.holderId || bucket.floor.holderId === client.id) {
      bucket.floor = { holderId: client.id, holderName: client.name };
      rememberFloor(bucket);
      sendFloorResult(client, true, undefined, bucket.floor);
      broadcastFloor(bucket);
      if (bucket.state) broadcastState(bucket, client.ws);
      return;
    }
    sendFloorResult(client, false, "busy", bucket.floor);
  }
}

function applyPush(bucket: Room, client: Client, raw: unknown): void {
  if (client.role === "tv") return;
  const incoming = asRecord(raw);
  if (!incoming) return;

  const isHost = client.role === "phone";
  const isGuest = client.role === "guest";
  const wantsMic = incoming.listening === true;
  const dropsMic = incoming.listening === false;

  if (wantsMic && bucket.floor.holderId && bucket.floor.holderId !== client.id) {
    if (isHost) {
      // Host reclaim by pushing listening:true is not enough — UI uses force.
      send(client.ws, {
        type: "floor",
        ok: false,
        reason: "busy",
        action: "claim",
        floor: snapshotFloor(bucket.floor),
      });
      applyHostMeta(bucket, client, incoming);
      return;
    }
    send(client.ws, {
      type: "floor",
      ok: false,
      reason: "busy",
      action: "claim",
      floor: snapshotFloor(bucket.floor),
    });
    return;
  }

  if (wantsMic && (!bucket.floor.holderId || bucket.floor.holderId === client.id)) {
    bucket.floor = { holderId: client.id, holderName: client.name };
  }

  const holding = bucket.floor.holderId === client.id;
  const hostOwnsIdle = isHost && !bucket.floor.holderId;
  if (isGuest && !holding) {
    if (wantsMic) {
      send(client.ws, {
        type: "error",
        message: "Mic in use",
        floor: snapshotFloor(bucket.floor),
      });
    }
    // listening:false after the floor was already released is not a caption.
    return;
  }

  const base = bucket.state ?? defaultState(client.room);
  const next: RoomState = { ...base, room: client.room };

  if (isHost) {
    if (typeof incoming.layout === "string" && LAYOUTS.has(incoming.layout)) {
      next.layout = incoming.layout;
    }
  }

  if (holding || hostOwnsIdle) {
    if (Array.isArray(incoming.lines)) next.lines = incoming.lines;
    if (typeof incoming.sourceLang === "string" && LANGS.has(incoming.sourceLang)) {
      next.sourceLang = incoming.sourceLang;
    }
    if (typeof incoming.listening === "boolean") next.listening = incoming.listening;
    if (dropsMic) bucket.floor = emptyFloor();
  }

  bucket.state = withFloor(next, bucket.floor, client.room);
  const payload = JSON.stringify({ type: "state", state: bucket.state });
  for (const peer of bucket.clients) {
    if (peer.ws !== client.ws && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(payload);
    }
  }
  if (dropsMic) broadcastFloor(bucket);
}

function applyHostMeta(bucket: Room, client: Client, incoming: RoomState): void {
  if (client.role !== "phone") return;
  const base = bucket.state ?? defaultState(client.room);
  const next: RoomState = { ...base, room: client.room };
  if (typeof incoming.layout === "string" && LAYOUTS.has(incoming.layout)) {
    next.layout = incoming.layout;
  }
  bucket.state = withFloor(next, bucket.floor, client.room);
  broadcastState(bucket, client.ws);
}

function patchListening(bucket: Room, listening: boolean): void {
  if (!bucket.state) return;
  bucket.state = withFloor({ ...bucket.state, listening }, bucket.floor, String(bucket.state.room ?? ""));
}

/** State snapshots must carry the live floor. A claim used to broadcast the previous null holder. */
function rememberFloor(bucket: Room): void {
  if (!bucket.state) return;
  const room = typeof bucket.state.room === "string" ? bucket.state.room : "";
  bucket.state = withFloor(bucket.state, bucket.floor, room);
}

function defaultState(room: string): RoomState {
  return {
    room,
    layout: "en-es-pt",
    sourceLang: "en",
    listening: false,
    lines: [],
    floor: emptyFloor(),
  };
}

function withFloor(state: RoomState, floor: Floor, room: string): RoomState {
  const layout = typeof state.layout === "string" && LAYOUTS.has(state.layout) ? state.layout : "en-es-pt";
  const sourceLang = typeof state.sourceLang === "string" && LANGS.has(state.sourceLang) ? state.sourceLang : "en";
  return {
    room: typeof state.room === "string" && state.room ? state.room : room,
    layout,
    sourceLang,
    listening: floor.holderId ? Boolean(state.listening) : false,
    lines: Array.isArray(state.lines) ? state.lines : [],
    floor: snapshotFloor(floor),
  };
}

function emptyFloor(): Floor {
  return { holderId: null, holderName: null };
}

function snapshotFloor(floor: Floor): Floor {
  return { holderId: floor.holderId, holderName: floor.holderName };
}

function parseRole(value: unknown): Role {
  if (value === "tv") return "tv";
  if (value === "guest") return "guest";
  return "phone";
}

function parseFloorAction(value: unknown): "claim" | "release" | "force" | "" {
  if (value === "claim" || value === "release" || value === "force") return value;
  return "";
}

function sanitizeName(value: unknown, fallback: string): string {
  const name = String(value ?? "")
    .replace(/[\u0000-\u001f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  return name || fallback;
}

function asRecord(value: unknown): RoomState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RoomState;
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function sendFloorResult(client: Client, ok: boolean, reason: string | undefined, floor: Floor): void {
  send(client.ws, {
    type: "floor",
    ok,
    reason,
    floor: snapshotFloor(floor),
  });
}

function peerCounts(bucket: Room): { phones: number; tvs: number; guests: number } {
  let phones = 0;
  let tvs = 0;
  let guests = 0;
  for (const client of bucket.clients) {
    if (client.role === "tv") tvs += 1;
    else if (client.role === "guest") {
      guests += 1;
      phones += 1;
    } else phones += 1;
  }
  return { phones, tvs, guests };
}

function broadcastPeers(bucket: Room): void {
  const payload = JSON.stringify({ type: "peers", ...peerCounts(bucket) });
  for (const client of bucket.clients) {
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(payload);
  }
}

function broadcastFloor(bucket: Room): void {
  const payload = JSON.stringify({ type: "floor", floor: snapshotFloor(bucket.floor) });
  for (const client of bucket.clients) {
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(payload);
  }
}

function broadcastState(bucket: Room, except?: WebSocket): void {
  if (!bucket.state) return;
  const payload = JSON.stringify({ type: "state", state: bucket.state });
  for (const peer of bucket.clients) {
    if (peer.ws === except) continue;
    if (peer.ws.readyState === WebSocket.OPEN) peer.ws.send(payload);
  }
}
