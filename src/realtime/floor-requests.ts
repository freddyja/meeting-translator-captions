/**
 * Floor (speaking turn) requests carry an id. The relay echoes it as
 * `requestId`, so a reply resolves the request that asked for it.
 * Unsolicited floor notices (a busy push, a broadcast) never resolve a waiter.
 */
export type FloorReply = {
  type: string;
  ok?: boolean;
  reason?: string;
  action?: string;
  requestId?: number;
};

export type FloorRequests = {
  /** Register a waiter and return the id to send with the request. */
  open(resolve: (reply: FloorReply) => void): number;
  /** Route a relay reply. Returns true when it resolved a waiter. */
  settle(reply: FloorReply): boolean;
  /** Drop one waiter (timeout). */
  cancel(id: number): void;
  /** Resolve every open waiter with `reply` (close / socket loss). */
  failAll(reply: FloorReply): void;
  readonly size: number;
};

export function createFloorRequests(): FloorRequests {
  let nextId = 0;
  const waiting = new Map<number, (reply: FloorReply) => void>();
  return {
    open(resolve) {
      nextId += 1;
      waiting.set(nextId, resolve);
      return nextId;
    },
    settle(reply) {
      if (typeof reply.ok !== "boolean") return false;
      if (typeof reply.requestId === "number") {
        const waiter = waiting.get(reply.requestId);
        if (!waiter) return false;
        waiting.delete(reply.requestId);
        waiter(reply);
        return true;
      }
      return false;
    },
    cancel(id) {
      waiting.delete(id);
    },
    failAll(reply) {
      const all = [...waiting.values()];
      waiting.clear();
      for (const waiter of all) waiter(reply);
    },
    get size() {
      return waiting.size;
    },
  };
}
