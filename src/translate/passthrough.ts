import type { Translator } from "./types";

export const passthroughTranslator: Translator = {
  id: "passthrough",
  async translate(text) {
    return text;
  },
};
