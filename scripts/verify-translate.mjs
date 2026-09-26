import {
  DEEPL_FREE_HOST,
  DEEPL_PRO_HOST,
  deeplSourceLang,
  deeplTargetLang,
  langFromDeepLProbe,
  mapDeepLLang,
  parseDeepLResponse,
  resolveDeepLApiUrl,
} from "../src/translate/deepl.ts";
import { speechSourceLang } from "../src/speech-caption.ts";
import { detectLang } from "../src/translate/detect.ts";
import { foreignEchoes, spokenKey, stripForeignEchoes } from "../src/translate/panes.ts";
import { createMinTTranslator, parseMinTResponse } from "../src/translate/mint.ts";
import { parseMyMemoryResponse, createMyMemoryTranslator, isIdentityTranslation } from "../src/translate/mymemory.ts";
import {
  effectiveTranslateProvider,
  reportedTranslateProvider,
  resolveTranslateProvider,
  translateCaption,
} from "../server/translate.ts";

const offline = process.argv.includes("--offline");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function checkMockOverride() {
  await withEnv(
    { TRANSLATE_PROVIDER: "mymemory", DEEPL_API_KEY: "", DEEPL_AUTH_KEY: "", GOOGLE_TRANSLATE_API_KEY: "" },
    async () => {
      assert(resolveTranslateProvider() === "mymemory", "env still mymemory");
      assert(effectiveTranslateProvider("mock") === "mock", "request mock wins");
      assert(effectiveTranslateProvider("deepl") === "mymemory", "client cannot force deepl");
      const result = await translateCaption(
        "Welcome everyone. Thank you for coming tonight. Let us begin.",
        "en",
        ["es", "pt"],
        { provider: "mock" },
      );
      assert(result.provider === "mock", "translateCaption honors mock override");
      assert(String(result.text.es).toLowerCase().includes("bienvenidos"), "forced mock es");
      assert(String(result.text.pt).toLowerCase().includes("bem-vindos"), "forced mock pt");
    },
  );
}

async function checkProviderDefaults() {
  await withEnv(
    { TRANSLATE_PROVIDER: "", DEEPL_API_KEY: "", DEEPL_AUTH_KEY: "", GOOGLE_TRANSLATE_API_KEY: "" },
    () => {
      assert(resolveTranslateProvider() === "mymemory", "no keys defaults to mymemory");
      assert(reportedTranslateProvider() === "mymemory" || reportedTranslateProvider() === "mint", "reported is a no-key provider");
    },
  );
  await withEnv(
    { TRANSLATE_PROVIDER: "deepl", DEEPL_API_KEY: "", DEEPL_AUTH_KEY: "", GOOGLE_TRANSLATE_API_KEY: "" },
    () => {
      assert(resolveTranslateProvider() === "mymemory", "deepl without key uses mymemory");
    },
  );
  await withEnv(
    { TRANSLATE_PROVIDER: "deepl", DEEPL_API_KEY: "not-a-real-key:fx", DEEPL_AUTH_KEY: "", GOOGLE_TRANSLATE_API_KEY: "" },
    () => {
      assert(resolveTranslateProvider() === "deepl", "deepl with a key is selected");
    },
  );
  await withEnv(
    { TRANSLATE_PROVIDER: "", DEEPL_API_KEY: "not-a-real-key:fx", DEEPL_AUTH_KEY: "", GOOGLE_TRANSLATE_API_KEY: "" },
    () => {
      assert(resolveTranslateProvider() === "deepl", "unset provider uses deepl when key present");
    },
  );
  await withEnv({ TRANSLATE_PROVIDER: "mymemory", DEEPL_API_KEY: "not-a-real-key:fx", DEEPL_AUTH_KEY: "" }, () => {
    assert(resolveTranslateProvider() === "mymemory", "explicit mymemory wins");
  });
  await withEnv({ TRANSLATE_PROVIDER: "mock", DEEPL_API_KEY: "", DEEPL_AUTH_KEY: "", GOOGLE_TRANSLATE_API_KEY: "" }, () => {
    assert(resolveTranslateProvider() === "mock", "explicit mock stays offline");
  });
  await withEnv({ TRANSLATE_PROVIDER: "google", GOOGLE_TRANSLATE_API_KEY: "" }, () => {
    assert(resolveTranslateProvider() === "mymemory", "google without key uses mymemory");
  });
  await withEnv({ TRANSLATE_PROVIDER: "google", GOOGLE_TRANSLATE_API_KEY: "not-a-real-key" }, () => {
    assert(resolveTranslateProvider() === "google", "google with a key is selected");
  });
  await withEnv({ TRANSLATE_PROVIDER: "mint", DEEPL_API_KEY: "", DEEPL_AUTH_KEY: "", GOOGLE_TRANSLATE_API_KEY: "" }, () => {
    assert(resolveTranslateProvider() === "mint", "explicit mint is selected");
  });
}

function checkDeepLMapping() {
  assert(deeplSourceLang("en") === "EN", "source en");
  assert(deeplSourceLang("es") === "ES", "source es");
  assert(deeplSourceLang("pt") === "PT", "source pt");
  assert(deeplTargetLang("en") === "EN-US", "target en");
  assert(deeplTargetLang("es") === "ES", "target es");
  assert(deeplTargetLang("pt") === "PT-BR", "target pt is PT-BR");
  assert(resolveDeepLApiUrl("abc:fx") === DEEPL_FREE_HOST, "free key uses free host");
  assert(resolveDeepLApiUrl("abc") === DEEPL_PRO_HOST, "pro key uses pro host");
  assert(
    resolveDeepLApiUrl("abc", "https://api-free.deepl.com/") === DEEPL_FREE_HOST,
    "explicit url wins",
  );
  assert(
    parseDeepLResponse({ translations: [{ text: "  Buenas noches  " }] }) === "Buenas noches",
    "deepl parse",
  );
  let threw = false;
  try {
    parseDeepLResponse({ message: "Quota exceeded" });
  } catch (err) {
    threw = /quota/i.test(err instanceof Error ? err.message : String(err));
  }
  assert(threw, "deepl empty body is an error");
}

function checkDetectLang() {
  assert(detectLang("Bienvenidos a todos. Gracias por venir esta noche.", "en") === "es", "spanish overrides en hint");
  assert(detectLang("Bem-vindos a todos. Obrigado por vir esta noite.", "en") === "pt", "portuguese overrides en hint");
  assert(detectLang("Welcome everyone. Thank you for coming tonight.", "es") === "en", "english overrides es hint");
  assert(detectLang("Bienvenidos a todos", "es") === "es", "keep es hint");
  assert(detectLang("Welcome everyone", "en") === "en", "keep en hint");
  assert(detectLang("Ok", "es") === "es", "short shared word keeps hint");
  assert(detectLang("Hola amigos", "en") === "es", "hola amigos is Spanish even when Spoken is English");
  assert(detectLang("Hola hermanos", "en") === "es", "hola hermanos is Spanish even when Spoken is English");
  assert(detectLang("El cafe es bueno", "en") === "es", "el cafe es bueno is Spanish even when Spoken is English");
  assert(detectLang("Boa noite a todos", "en") === "pt", "boa noite is Portuguese even when Spoken is English");
  assert(detectLang("Welcome everyone", "pt") === "en", "english overrides pt hint");
  assert(mapDeepLLang("EN-US") === "en" && mapDeepLLang("ES") === "es" && mapDeepLLang("PT-BR") === "pt", "DeepL detect codes");
  assert(mapDeepLLang("FR") === null, "other DeepL codes are not a caption language");
  assert(
    langFromDeepLProbe("en", undefined, "Bad request. Reason: Source and target language are equal.") === "en",
    "DeepL equal-language probe means the text is already English",
  );
  assert(langFromDeepLProbe("en", "ES") === "es", "DeepL detected Spanish against an English probe");
  assert(isIdentityTranslation("Hola amigos", "Hola, amigos"), "punctuation-only copy is still the source text");
}

async function checkMockAnyDirection() {
  const samples = [
    {
      from: "es",
      text: "Bienvenidos a todos",
      expect: { en: /welcome|everyone/i, pt: /bem-vind|todos/i },
    },
    {
      from: "es",
      text: "Gracias por venir esta noche",
      expect: { en: /thank|coming|tonight/i, pt: /obrigado|noite/i },
    },
    {
      from: "es",
      text: "Buenos dias amigos",
      expect: { en: /morning|friend/i, pt: /dia|amig/i },
    },
    {
      from: "pt",
      text: "Bem-vindos a todos",
      expect: { en: /welcome|everyone/i, es: /bienvenid|todos/i },
    },
    {
      from: "pt",
      text: "Obrigado por vir esta noite",
      expect: { en: /thank|coming|tonight/i, es: /gracias|noche/i },
    },
    {
      from: "en",
      text: "Welcome everyone. Thank you for coming tonight. Let us begin.",
      expect: { es: /bienvenid|gracias|comenc/i, pt: /bem-vind|obrigado|come[cç]/i },
    },
  ];

  for (const sample of samples) {
    const result = await translateCaption(sample.text, sample.from, ["en", "es", "pt"], { provider: "mock" });
    assert(result.provider === "mock", `${sample.from} mock provider`);
    assert(result.from === sample.from, `${sample.from} source kept (${result.from})`);
    assert(String(result.text[sample.from]).toLowerCase().includes(sample.text.slice(0, 8).toLowerCase()), `${sample.from} pane keeps source`);
    for (const [to, pattern] of Object.entries(sample.expect)) {
      const value = String(result.text[to] || "");
      assert(value.trim().length > 0, `mock ${sample.from}->${to} empty`);
      assert(value.trim() !== sample.text, `mock ${sample.from}->${to} unchanged: ${value}`);
      assert(pattern.test(value), `mock ${sample.from}->${to} unexpected: ${value}`);
    }
  }

  const rescued = await translateCaption(
    "Bienvenidos a todos. Gracias por venir esta noche.",
    "en",
    ["en", "es", "pt"],
    { provider: "mock" },
  );
  assert(rescued.from === "es", `detect spanish when from=en (got ${rescued.from})`);
  assert(/welcome|thank/i.test(String(rescued.text.en)), `rescued EN pane: ${rescued.text.en}`);
  assert(/bienvenid|gracias/i.test(String(rescued.text.es)), "rescued ES pane stays Spanish");
  assert(/bem-vind|obrigado|todos/i.test(String(rescued.text.pt)), `rescued PT pane: ${rescued.text.pt}`);

  const echoed = stripForeignEchoes("Hola amigos", "en", {
    en: "Hola amigos",
    es: "Hola, amigos",
    pt: "Olá amigos",
  });
  assert(echoed.en === "Hola amigos", "source pane keeps the transcript");
  assert(echoed.es === "", `Spanish echo is not left in the Spanish slot when filed as English: ${echoed.es}`);
  assert(/ol/i.test(echoed.pt), "a real Portuguese line stays");
  assert(
    foreignEchoes("pueden sentarse", "en", { en: "pueden sentarse", es: "pueden sentarse", pt: "podem sentar-se" }),
    "Spanish left in the Spanish pane counts as a missed English filing",
  );
  assert(
    spokenKey("Hola amigos", { en: "Hello friends", es: "Hola amigos", pt: "Olá amigos" }, "en") === "es",
    "coalesce on the pane that holds the transcript, not the Spoken chip",
  );
}

async function checkSpeechFiling() {
  assert(speechSourceLang("mi casa es Roja", "en", "en-US") === "es", "screenshot: mi casa es Roja is Spanish even when the chip is English");
  assert(speechSourceLang("pueden sentarse", "es", "en-US") === "es", "stuck en-US recognizer does not file Spanish speech as English");
  assert(speechSourceLang("pueden sentarse", "pt", "en-US") === "pt", "stuck en-US recognizer does not file Portuguese speech as English");
  assert(speechSourceLang("Hola amigos", "en", "en-US") === "es", "Spanish speech markers still leave the English chip");
  assert(speechSourceLang("Boa noite a todos", "en", "en-US") === "pt", "Portuguese speech markers still leave the English chip");
  assert(speechSourceLang("Welcome everyone", "es", "es-ES") === "en", "English speech still leaves a Spanish chip");
  assert(speechSourceLang("Welcome everyone", "pt", "pt-BR") === "en", "English speech still leaves a Portuguese chip");
  assert(speechSourceLang("the hermanos", "es", "en-US") === "es", "an English function word does not steal a Spanish mic");
  assert(speechSourceLang("Ok", "es", "es-ES") === "es", "a short Spanish mic utterance stays Spanish");

  const spoken = [
    {
      chip: "es",
      locale: "en-US",
      text: "pueden sentarse",
      from: "es",
      expect: { en: /seated|you may/i, pt: /sent/i },
    },
    {
      chip: "es",
      locale: "es-ES",
      text: "Hola amigos",
      from: "es",
      expect: { en: /hello|friend/i, pt: /ol[aá]|amig/i },
    },
    {
      chip: "pt",
      locale: "en-US",
      text: "Boa noite a todos",
      from: "pt",
      expect: { en: /night|evening|everyone/i, es: /noche|todos/i },
    },
    {
      chip: "en",
      locale: "en-US",
      text: "Welcome everyone",
      from: "en",
      expect: { es: /bienvenid|todos/i, pt: /bem-vind|todos/i },
    },
    {
      chip: "en",
      locale: "en-US",
      text: "Hola amigos",
      from: "es",
      expect: { en: /hello|friend/i, pt: /ol[aá]|amig/i },
    },
  ];

  for (const sample of spoken) {
    const lang = speechSourceLang(sample.text, sample.chip, sample.locale);
    assert(lang === sample.from, `speech ${sample.locale} chip ${sample.chip} "${sample.text}" → ${lang}, want ${sample.from}`);
    const result = await translateCaption(sample.text, lang, ["en", "es", "pt"], {
      provider: "mock",
      trustHint: true,
    });
    assert(result.from === sample.from, `speech caption filed as ${result.from}, want ${sample.from} (${sample.text})`);
    assert(
      String(result.text[sample.from]).toLowerCase().includes(sample.text.slice(0, 6).toLowerCase()),
      `speech ${sample.from} pane keeps "${sample.text}" (${result.text[sample.from]})`,
    );
    for (const [to, pattern] of Object.entries(sample.expect)) {
      const value = String(result.text[to] || "");
      assert(value.trim().length > 0, `speech ${sample.text} ${to} empty`);
      assert(!isIdentityTranslation(sample.text, value), `speech ${sample.text} left in ${to}: ${value}`);
      assert(pattern.test(value), `speech ${sample.text} ${to} unexpected: ${value}`);
    }
    if (sample.from !== "en") {
      assert(!isIdentityTranslation(sample.text, result.text.en || ""), `EN pane still has the ${sample.from} transcript: ${result.text.en}`);
    }
  }

  // Live bug: trustHint + Spoken EN filed this as English, so EN kept the
  // transcript while PT still translated ("2. Mi casa es roja" / "minha casa é vermelha").
  const casa = await translateCaption("mi casa es Roja", "en", ["en", "es", "pt"], {
    provider: "mock",
    trustHint: true,
  });
  assert(casa.from === "es", `mi casa es Roja filed as ${casa.from}`);
  assert(/house/i.test(casa.text.en), `EN pane for mi casa es Roja: ${casa.text.en}`);
  assert(!isIdentityTranslation("mi casa es Roja", casa.text.en || ""), `EN pane still Spanish: ${casa.text.en}`);
  assert(String(casa.text.es).toLowerCase().includes("casa"), "ES pane keeps the Spanish house");

  const welcome = await translateCaption("Welcome everyone", "en", ["en", "es", "pt"], {
    provider: "mock",
    trustHint: true,
  });
  assert(welcome.from === "en", `English speech filed as ${welcome.from}`);
  assert(/bienvenid/i.test(welcome.text.es), `EN→ES: ${welcome.text.es}`);
  assert(/bem-vind|todos/i.test(welcome.text.pt), `EN→PT: ${welcome.text.pt}`);

  const noite = await translateCaption("Boa noite a todos", "pt", ["en", "es", "pt"], {
    provider: "mock",
    trustHint: true,
  });
  assert(noite.from === "pt", `Portuguese speech filed as ${noite.from}`);
  assert(/night|evening|everyone/i.test(noite.text.en), `PT→EN: ${noite.text.en}`);
  assert(!isIdentityTranslation("Boa noite a todos", noite.text.en || ""), `PT left in EN: ${noite.text.en}`);
}

async function checkSpokenPaneMatrix() {
  const samples = [
    {
      hint: "en",
      text: "Hola amigos",
      from: "es",
      expect: { en: /hello|friend/i, pt: /ol[aá]|amig/i },
    },
    {
      hint: "es",
      text: "Hola amigos",
      from: "es",
      expect: { en: /hello|friend/i, pt: /ol[aá]|amig/i },
    },
    {
      hint: "en",
      text: "Welcome everyone",
      from: "en",
      expect: { es: /bienvenid|todos/i, pt: /bem-vind|todos/i },
    },
    {
      hint: "pt",
      text: "Welcome everyone",
      from: "en",
      expect: { es: /bienvenid|todos/i, pt: /bem-vind|todos/i },
    },
    {
      hint: "en",
      text: "Boa noite a todos",
      from: "pt",
      expect: { en: /night|evening|everyone/i, es: /noche|todos/i },
    },
    {
      hint: "es",
      text: "Boa noite a todos",
      from: "pt",
      expect: { en: /night|evening|everyone/i, es: /noche|todos/i },
    },
    {
      hint: "en",
      text: "pueden sentarse",
      from: "es",
      expect: { en: /seated|you may/i, pt: /sent/i },
    },
  ];

  for (const sample of samples) {
    const result = await translateCaption(sample.text, sample.hint, ["en", "es", "pt"], { provider: "mock" });
    assert(result.from === sample.from, `${sample.hint} hint + "${sample.text}" filed as ${result.from}, want ${sample.from}`);
    assert(
      String(result.text[sample.from]).toLowerCase().includes(sample.text.slice(0, 6).toLowerCase()),
      `${sample.from} pane keeps "${sample.text}" (${result.text[sample.from]})`,
    );
    for (const [to, pattern] of Object.entries(sample.expect)) {
      const value = String(result.text[to] || "");
      assert(value.trim().length > 0, `${sample.text} ${sample.from}->${to} empty`);
      assert(!isIdentityTranslation(sample.text, value), `${sample.text} ${to} pane still source: ${value}`);
      assert(pattern.test(value), `${sample.text} ${sample.from}->${to} unexpected: ${value}`);
    }
  }
}

function checkMyMemoryParser() {
  assert(
    parseMyMemoryResponse({
      responseStatus: 200,
      responseData: { translatedText: "Buenas noches &amp; paz" },
    }) === "Buenas noches & paz",
    "decode entities",
  );

  let threw = false;
  try {
    parseMyMemoryResponse({
      responseStatus: 200,
      responseData: {
        translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY",
      },
    });
  } catch {
    threw = true;
  }
  assert(threw, "quota warning is an error");
  assert(isIdentityTranslation("Bienvenidos a todos", "Bienvenidos a todos"), "identity two words");
  assert(!isIdentityTranslation("ok", "ok"), "short identity is allowed");
}

function checkMinTParser() {
  assert(
    parseMinTResponse({ translation: "  Good evening everyone  ", model: "nllb200-600M" }) ===
      "Good evening everyone",
    "mint parse trims",
  );
  let threw = false;
  try {
    parseMinTResponse({});
  } catch {
    threw = true;
  }
  assert(threw, "empty mint body is an error");
}

const FREEFORM = [
  {
    from: "es",
    text: "Por favor empecemos la reunión juntos esta noche.",
    expect: { en: /please|start|meeting|together|tonight/i, pt: /favor|começ|reuni|juntos|noite/i },
  },
  {
    from: "pt",
    text: "Por favor vamos começar a reunião juntos esta noite.",
    expect: { en: /please|start|meeting|together|tonight/i, es: /favor|empez|reuni|juntos|noche/i },
  },
  {
    from: "en",
    text: "Please start the meeting together tonight.",
    expect: { es: /favor|empez|reuni|juntos|noche/i, pt: /favor|começ|reuni|juntos|noite/i },
  },
];

async function checkTranslatorPairs(label, translator, samples) {
  for (const sample of samples) {
    for (const [to, pattern] of Object.entries(sample.expect)) {
      const translated = await translator.translate(sample.text, sample.from, to);
      assert(translated.trim().length > 0, `${label} ${sample.from}->${to} empty`);
      assert(translated.trim() !== sample.text, `${label} ${sample.from}->${to} unchanged`);
      assert(pattern.test(translated), `${label} ${sample.from}->${to} unexpected: ${translated}`);
      console.log(`  ${label} ${sample.from}->${to}: ${translated}`);
    }
  }
}

async function checkLivePairs() {
  await checkTranslatorPairs("MyMemory", createMyMemoryTranslator({ timeoutMs: 12000 }), [
    { from: "en", text: "Good evening everyone", expect: { es: /noche|todos/i, pt: /noite|todos/i } },
    { from: "es", text: "Buenas noches a todos", expect: { en: /evening|night|everyone|all/i, pt: /noite|todos/i } },
    { from: "pt", text: "Boa noite a todos", expect: { en: /evening|night|everyone|all/i, es: /noche|todos/i } },
  ]);
}

async function checkLiveMinTPairs() {
  await checkTranslatorPairs("MinT", createMinTTranslator({ timeoutMs: 20000 }), FREEFORM);
}

async function checkLiveCaptionFallback() {
  await withEnv(
    {
      TRANSLATE_PROVIDER: "mymemory",
      DEEPL_API_KEY: "",
      DEEPL_AUTH_KEY: "",
      GOOGLE_TRANSLATE_API_KEY: "",
      MYMEMORY_URL: "https://127.0.0.1:1/mymemory-forced-down",
      MYMEMORY_TIMEOUT_MS: "400",
    },
    async () => {
      for (const sample of FREEFORM) {
        const result = await translateCaption(sample.text, sample.from, ["en", "es", "pt"]);
        assert(result.provider === "mint", `forced-MyMemory-down uses MinT (got ${result.provider})`);
        assert(reportedTranslateProvider() === "mint", "health/API report mint after MyMemory failure");
        assert(result.from === sample.from, `fallback from ${sample.from}`);
        for (const [to, pattern] of Object.entries(sample.expect)) {
          const value = String(result.text[to] || "");
          assert(value.trim().length > 0, `fallback ${sample.from}->${to} empty`);
          assert(value.trim() !== sample.text, `fallback ${sample.from}->${to} identity: ${value}`);
          assert(pattern.test(value), `fallback ${sample.from}->${to} unexpected: ${value}`);
          console.log(`  fallback ${sample.from}->${to} [${result.provider}]: ${value}`);
        }
      }
    },
  );
}

const checks = [
  ["provider defaults", checkProviderDefaults],
  ["DeepL mapping", checkDeepLMapping],
  ["source language detect", checkDetectLang],
  ["MyMemory response parser", checkMyMemoryParser],
  ["MinT response parser", checkMinTParser],
  ["mock request override", checkMockOverride],
  ["mock any-direction EN/ES/PT", checkMockAnyDirection],
  ["spoken EN/ES/PT pane matrix", checkSpokenPaneMatrix],
  ["speech mic filing", checkSpeechFiling],
];

for (const [name, fn] of checks) {
  await fn();
  console.log(`OK ${name}`);
}

if (offline) {
  console.log("OK skipped live MyMemory/MinT (--offline)");
} else {
  console.log("Live MinT EN/ES/PT free-form…");
  await checkLiveMinTPairs();
  console.log("OK live MinT pairs");
  console.log("Live MyMemory→MinT fallback (MyMemory forced down)…");
  await checkLiveCaptionFallback();
  console.log("OK MyMemory→MinT fallback");
  try {
    console.log("Live MyMemory EN/ES/PT…");
    await checkLivePairs();
    console.log("OK live MyMemory pairs");
  } catch (err) {
    console.warn("MyMemory live pairs skipped:", err instanceof Error ? err.message : err);
  }
}
