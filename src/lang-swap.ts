import { isLang, type Lang, type Layout, type WatchLang } from "./types.ts";

/**
 * One-tap ⇄: the Spoken language becomes the Watch language and back.
 * Only a single Watch language that differs from Spoken can swap; "all three"
 * (or the same language twice) has nothing to trade, so the button is disabled.
 */
export function swapHostLangs(spoken: Lang, layout: Layout): { spoken: Lang; layout: Layout } | null {
  if (!isLang(layout) || layout === spoken) return null;
  return { spoken: layout, layout: spoken };
}

export function swapGuestLangs(spoken: Lang, watch: WatchLang): { spoken: Lang; watch: WatchLang } | null {
  if (!isLang(watch) || watch === spoken) return null;
  return { spoken: watch, watch: spoken };
}

export const SWAP_ICON = "⇄";
