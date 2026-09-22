import type { Lang } from "../types";
import { foldDiacritics } from "./text.ts";

const ES_HINTS =
  /\b(el|la|los|las|una|unos|unas|del|al|gracias|amigos|buenas|buenos|ustedes|nosotros|tambien|porque|hoy|palabra|bienvenidos|comencemos|abran|perdon|perdón|todos)\b/u;
const PT_HINTS =
  /\b(nao|uma|uns|umas|obrigado|obrigada|amigos|voces|voce|tambem|hoje|palavra|bem-vindos|comecar|abram|todos)\b/u;
const EN_HINTS =
  /\b(the|thank|thanks|welcome|friends|friend|evening|night|morning|today|please|everyone|let|begin|coming|tonight)\b/u;

function hits(pattern: RegExp, folded: string): number {
  return folded.match(new RegExp(pattern, "gu"))?.length ?? 0;
}

/**
 * Prefer the spoken-language hint. Override only when the caption is clearly
 * another of EN/ES/PT — the production bug was `from=en` with Spanish STT.
 */
export function detectLang(text: string, hint: Lang): Lang {
  const folded = foldDiacritics(text);
  if (!folded.trim()) return hint;

  let en = hits(EN_HINTS, folded);
  let es = hits(ES_HINTS, folded);
  let pt = hits(PT_HINTS, folded);

  if (/[ñ¿¡]/.test(text)) es += 3;
  if (/[ãõ]/.test(text)) pt += 3;
  if (/\b(gracias|ustedes|bienvenidos|buenas noches|buenos dias)\b/.test(folded)) es += 2;
  if (/\b(obrigado|obrigada|nao|bem-vindos|boa noite|bom dia)\b/.test(folded)) pt += 2;
  if (/\b(thank you|welcome everyone|good evening|good morning|let us begin)\b/.test(folded)) en += 2;

  const scores: Record<Lang, number> = { en, es, pt };
  const ranked = (["en", "es", "pt"] as Lang[]).sort((a, b) => scores[b] - scores[a] || (a === hint ? -1 : 0));
  const best = ranked[0];
  if (best === hint) return hint;
  if (scores[best] >= 2 && scores[best] >= scores[hint] + 2) return best;
  return hint;
}
