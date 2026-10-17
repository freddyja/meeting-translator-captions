/** When an update may reload the page on its own. Pure, so it is unit tested. */
export type Activity = {
  /** Mic is listening (any speech provider started and not stopped). */
  micLive: boolean;
  /** ms timestamp of the last speech result, final or interim. */
  lastCaptionAt: number;
  /** A room view (phone host, guest join, TV) is open. */
  roomActive: boolean;
  /** Focus is in a text field that has unsent text (Type+Send, Write). */
  typing: boolean;
  now: number;
};

export type BusyReason = "mic" | "caption" | "room" | "typing";

/** A caption is "in progress" for this long after the last result. */
export const CAPTION_QUIET_MS = 4000;

export function busyReason(a: Activity): BusyReason | null {
  if (a.micLive) return "mic";
  if (a.now - a.lastCaptionAt < CAPTION_QUIET_MS) return "caption";
  if (a.roomActive) return "room";
  if (a.typing) return "typing";
  return null;
}

export type UpdateAction = "none" | "reload" | "pill";

/**
 * pending: a new build is ready. tapped: the user tapped the pill.
 * alreadyTried: we auto-reloaded for this exact build once this session and it is
 * still not live (stale CDN), so do not loop; leave it to the pill.
 */
export function decideUpdate(opts: {
  pending: boolean;
  busy: BusyReason | null;
  tapped?: boolean;
  alreadyTried?: boolean;
}): UpdateAction {
  if (!opts.pending) return "none";
  if (opts.tapped) return "reload";
  if (opts.busy || opts.alreadyTried) return "pill";
  return "reload";
}
