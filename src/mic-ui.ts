/**
 * What the mic button and status line show. Pure, so it is unit-tested.
 *
 * "Listening" means a live microphone session on THIS device. Holding the
 * one-speaker floor is not enough: Type + Send claims the floor too, and a typed
 * message must never light up the mic, flip Start to Stop, or say "You're speaking".
 */
export type MicUiInput = {
  /** This device holds the room's speaking turn. */
  holding: boolean;
  /** A live microphone session is running on this device (not a typed claim). */
  micLive: boolean;
  /** Someone else holds the turn and the room is live. */
  blocked: boolean;
};

export type MicUi = {
  /** Mic button glows / pulses and reads "Tap to stop". */
  hot: boolean;
  /** Status says Listening and the floor banner says "You're speaking". */
  listening: boolean;
  label: "stop" | "wait" | "start";
};

export function micUi({ holding, micLive, blocked }: MicUiInput): MicUi {
  const listening = holding && micLive;
  return { hot: listening, listening, label: listening ? "stop" : blocked ? "wait" : "start" };
}

/**
 * After a typed message is posted, give the speaking turn back unless the mic
 * is live or more typed messages are still being posted.
 */
export function shouldReleaseTypedFloor(opts: { holding: boolean; micLive: boolean; publishing: number }): boolean {
  return opts.holding && !opts.micLive && opts.publishing <= 0;
}
