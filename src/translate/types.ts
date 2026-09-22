import type { Lang } from "../types";

export type Translator = {
  readonly id: string;
  translate(text: string, from: Lang, to: Lang): Promise<string>;
  translateAll?(text: string, from: Lang): Promise<Record<Lang, string>>;
};

export async function translateAll(
  translator: Translator,
  text: string,
  from: Lang,
): Promise<Record<Lang, string>> {
  if (translator.translateAll) return translator.translateAll(text, from);
  const langs: Lang[] = ["en", "es", "pt"];
  const entries = await Promise.all(
    langs.map(async (to) => [to, to === from ? text : await translator.translate(text, from, to)] as const),
  );
  return { en: "", es: "", pt: "", ...Object.fromEntries(entries) };
}
