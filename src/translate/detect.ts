import type { Lang } from "../types";
import { foldDiacritics } from "./text.ts";

/**
 * Spoken-language check for caption panes. The mic chip is only a hint:
 * live speech was filed under English whenever the hint was `en`, so the
 * English window showed the Spanish (or Portuguese) transcript.
 * A language wins when its markers lead by 2. Otherwise the hint stands
 * and the translator may still retarget if that filing echoes the source.
 */
const MARKER_ROWS: Array<[string, Lang, number]> = [
  ["the", "en", 2],
  ["thank", "en", 3],
  ["thanks", "en", 3],
  ["welcome", "en", 3],
  ["friends", "en", 2],
  ["friend", "en", 2],
  ["please", "en", 2],
  ["everyone", "en", 2],
  ["hello", "en", 3],
  ["hi", "en", 2],
  ["morning", "en", 2],
  ["evening", "en", 2],
  ["tonight", "en", 2],
  ["today", "en", 1],
  ["coming", "en", 2],
  ["begin", "en", 2],
  ["let", "en", 1],
  ["brothers", "en", 2],
  ["brother", "en", 2],
  ["sister", "en", 2],
  ["sisters", "en", 2],
  ["good", "en", 1],
  ["night", "en", 1],
  ["is", "en", 1],
  ["are", "en", 1],
  ["was", "en", 1],
  ["were", "en", 1],
  ["you", "en", 1],
  ["we", "en", 1],
  ["our", "en", 1],
  ["your", "en", 1],
  ["and", "en", 1],
  ["for", "en", 1],
  ["with", "en", 1],
  ["that", "en", 1],
  ["this", "en", 1],
  ["have", "en", 1],
  ["from", "en", 1],
  ["yes", "en", 2],

  ["hola", "es", 3],
  ["gracias", "es", 3],
  ["ustedes", "es", 3],
  ["nosotros", "es", 2],
  ["nosotras", "es", 2],
  ["bienvenidos", "es", 3],
  ["bienvenido", "es", 3],
  ["bienvenida", "es", 3],
  ["buenos", "es", 2],
  ["buenas", "es", 2],
  ["noche", "es", 2],
  ["hermanos", "es", 3],
  ["hermano", "es", 3],
  ["hermana", "es", 3],
  ["hermanas", "es", 3],
  ["hoy", "es", 2],
  ["pero", "es", 2],
  ["muy", "es", 2],
  ["es", "es", 2],
  ["estan", "es", 2],
  ["estamos", "es", 2],
  ["estoy", "es", 2],
  ["bueno", "es", 2],
  ["buena", "es", 2],
  ["del", "es", 2],
  ["los", "es", 1],
  ["las", "es", 1],
  ["el", "es", 1],
  ["la", "es", 1],
  ["unos", "es", 2],
  ["unas", "es", 2],
  ["con", "es", 1],
  ["y", "es", 1],
  ["esto", "es", 2],
  ["aqui", "es", 2],
  ["ahora", "es", 2],
  ["quiero", "es", 2],
  ["tiene", "es", 2],
  ["tenemos", "es", 2],
  ["hay", "es", 2],
  ["cuando", "es", 2],
  ["donde", "es", 2],
  ["siempre", "es", 2],
  ["hablar", "es", 2],
  ["palabra", "es", 2],
  ["comencemos", "es", 3],
  ["abran", "es", 2],
  ["perdon", "es", 2],
  ["si", "es", 2],

  ["nao", "pt", 3],
  ["voce", "pt", 3],
  ["voces", "pt", 3],
  ["obrigado", "pt", 3],
  ["obrigada", "pt", 3],
  ["ola", "pt", 3],
  ["oi", "pt", 2],
  ["irmaos", "pt", 3],
  ["irmao", "pt", 3],
  ["irma", "pt", 3],
  ["irmas", "pt", 3],
  ["noite", "pt", 2],
  ["boa", "pt", 2],
  ["bom", "pt", 2],
  ["bem", "pt", 1],
  ["vindos", "pt", 2],
  ["vindo", "pt", 2],
  ["com", "pt", 2],
  ["sao", "pt", 3],
  ["pessoal", "pt", 3],
  ["isso", "pt", 2],
  ["isto", "pt", 2],
  ["muito", "pt", 2],
  ["hoje", "pt", 2],
  ["entao", "pt", 2],
  ["quero", "pt", 2],
  ["tem", "pt", 2],
  ["temos", "pt", 2],
  ["quando", "pt", 2],
  ["onde", "pt", 2],
  ["sempre", "pt", 2],
  ["falar", "pt", 2],
  ["comecar", "pt", 2],
  ["sim", "pt", 2],
  ["pra", "pt", 2],

  ["tambien", "es", 2],
  ["tambien", "pt", 2],
  ["porque", "es", 1],
  ["porque", "pt", 1],
  ["para", "es", 1],
  ["para", "pt", 1],
  ["por", "es", 1],
  ["por", "pt", 1],
  ["que", "es", 1],
  ["que", "pt", 1],
  ["como", "es", 1],
  ["como", "pt", 1],
  ["vamos", "es", 1],
  ["vamos", "pt", 1],
  ["esta", "es", 1],
  ["esta", "pt", 1],
  ["amigos", "es", 1],
  ["amigos", "pt", 1],
  ["amigo", "es", 1],
  ["amigo", "pt", 1],
  ["una", "es", 1],
  ["una", "pt", 1],
  ["todos", "es", 1],
  ["todos", "pt", 1],
  ["todo", "es", 1],
  ["todo", "pt", 1],
  ["dias", "es", 1],
  ["dias", "pt", 1],
];

const WORD_SCORE = new Map<string, Record<Lang, number>>();
for (const [word, lang, weight] of MARKER_ROWS) {
  const key = foldDiacritics(word);
  const row = WORD_SCORE.get(key) ?? { en: 0, es: 0, pt: 0 };
  row[lang] += weight;
  WORD_SCORE.set(key, row);
}

export function scoreLangs(text: string): Record<Lang, number> {
  const scores: Record<Lang, number> = { en: 0, es: 0, pt: 0 };
  const folded = foldDiacritics(text);
  if (!folded.trim()) return scores;
  for (const token of folded.match(/\p{L}+/gu) ?? []) {
    const row = WORD_SCORE.get(token);
    if (!row) continue;
    scores.en += row.en;
    scores.es += row.es;
    scores.pt += row.pt;
  }
  if (/[ñ¿¡]/u.test(text)) scores.es += 3;
  if (/[ãõ]/iu.test(text)) scores.pt += 3;
  if (/ç/iu.test(text)) scores.pt += 3;
  return scores;
}

/** Language the words support on their own. Null when the hint should stand. */
export function neutralLang(text: string): Lang | null {
  const scores = scoreLangs(text);
  const ranked = (["en", "es", "pt"] as Lang[]).sort((a, b) => scores[b] - scores[a]);
  const best = ranked[0];
  const second = ranked[1];
  if (scores[best] >= 2 && scores[best] >= scores[second] + 2) return best;
  return null;
}

export function detectLang(text: string, hint: Lang): Lang {
  if (!foldDiacritics(text).trim()) return hint;
  return neutralLang(text) ?? hint;
}

/** First entry is the best guess. The rest are retries when that filing echoes. */
export function langAttempts(text: string, hint: Lang): Lang[] {
  const first = detectLang(text, hint);
  const rest = (["es", "pt", "en"] as Lang[]).filter((lang) => lang !== first);
  return [first, ...rest];
}
