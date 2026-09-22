import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";

const started = [];
const target = process.argv[2] || "http://127.0.0.1:8080";
const base = target.replace(/\/$/, "");
const wsBase = base.replace(/^http/, "ws");

async function json(path) {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function text(path) {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return { res, body: await res.text() };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const health = await json("/health");
      if (health.ok) return health;
    } catch {
      /* retry */
    }
    await delay(250);
  }
  throw new Error(`No /health from ${base}`);
}

async function connect(role, room, name) {
  const ws = new WebSocket(`${wsBase}/caption-ws`);
  const inbox = [];
  await new Promise((resolve, reject) => {
    ws.once("error", reject);
    ws.once("open", resolve);
  });
  ws.on("message", (raw) => inbox.push(JSON.parse(String(raw))));
  ws.send(JSON.stringify({ type: "join", room, role, name }));
  return { ws, inbox };
}

async function waitFor(inbox, type, match) {
  for (let i = 0; i < 40; i += 1) {
    const hit = inbox.find((msg) => msg.type === type && (!match || match(msg)));
    if (hit) return hit;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${type}`);
}

async function maybeStartLocal() {
  if (process.argv[2]) return;
  try {
    await json("/health");
    return;
  } catch {
    /* start local production server */
  }
  const child = spawn(process.execPath, ["--experimental-strip-types", "server/index.ts"], {
    env: { ...process.env, PORT: "8080", HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  started.push(child);
  child.stdout.on("data", (buf) => process.stdout.write(buf));
  child.stderr.on("data", (buf) => process.stderr.write(buf));
}

async function main() {
  await maybeStartLocal();
  const health = await waitForHealth();
  assert(health.ok === true, "health.ok");
  assert(
    health.translate === "deepl" ||
      health.translate === "mymemory" ||
      health.translate === "mint" ||
      health.translate === "mock" ||
      health.translate === "google",
    "health.translate",
  );
  const retired = "top" + "ic";
  assert(!(retired in health), "health stays caption-only");

  const home = await text("/");
  assert(home.body.includes("Meeting Translator"), "home shell");
  assert(home.body.includes("manifest.webmanifest"), "manifest link");

  const phone = await text("/?view=phone&room=ABCD");
  const tv = await text("/?view=tv&room=ABCD");
  const tvLang = await text("/?view=tv&room=ABCD&lang=es");
  const join = await text("/?view=join&room=ABCD");
  assert(phone.body.includes('<div id="app">'), "phone route serves shell");
  assert(tv.body.includes('<div id="app">'), "tv route serves shell");
  assert(tvLang.body.includes('<div id="app">'), "tv lang=es route serves shell");
  assert(join.body.includes('<div id="app">'), "join route serves shell");

  const scriptSrc = home.body.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert(scriptSrc, "built app script");
  const { body: appJs } = await text(scriptSrc);
  assert(appJs.includes("Meeting Translator"), "Meeting Translator branding");
  assert(appJs.includes("Designed by Freddy Jara-Almonte"), "designer credit under the title");
  assert(!appJs.includes("Ask for " + retired), "no curriculum prompt");
  assert(!appJs.includes("of the day"), "no daily curriculum control");
  assert(appJs.includes("Send to TV"), "phone Send to TV button");
  assert(appJs.includes("Open TV view"), "optional Open TV view");
  assert(appJs.includes("Copy TV link"), "copy TV link");
  assert(appJs.includes("Keep the Fold on the mic page"), "send-to-TV steps");
  assert(appJs.includes("One language per monitor"), "per-language TV helpers");
  assert(appJs.includes("data-copy-lang"), "copy per-language TV link");
  assert(appJs.includes("data-open-lang"), "open per-language TV window");
  assert(appJs.includes("does not change other TVs in this room"), "lang= does not drive other TVs");
  assert(appJs.includes("is-lang-lock"), "TV lang lock class");
  assert(appJs.includes("QR code for the TV caption page"), "TV QR code");
  assert(appJs.includes("Smart View mode"), "Smart View mode button");
  assert(appJs.includes("Exit Smart View mode"), "exit Smart View mode");
  assert(!appJs.includes("Captions only"), "no extra caption toggle");
  assert(appJs.includes("data-smart-source"), "Smart View spoken language chips");
  assert(appJs.includes("Spoken language:"), "Smart View spoken language aria labels");
  assert(appJs.includes("Join on phones"), "host Join on phones button");
  assert(appJs.includes("Scan to watch and speak"), "join QR reminder");
  assert(appJs.includes("Someone else is speaking"), "floor busy copy");
  assert(appJs.includes("Reclaim mic"), "host can reclaim the mic");
  assert(appJs.includes("view=join"), "guest join query");
  assert(appJs.includes("Spoken language"), "spoken language chips");
  assert(appJs.includes("data-watch"), "join Watch preference");
  assert(appJs.includes("data-watch-box"), "join Watch control group");
  assert(appJs.includes("English only"), "watch English only");
  assert(appJs.includes("Español only"), "watch Español only");
  assert(appJs.includes("Português only"), "watch Português only");
  assert(appJs.includes("All three (EN | ES | PT)"), "watch all three");
  assert(appJs.includes("langsForWatch") || appJs.includes("mt-guest-watch"), "watch stays on this phone");
  assert(appJs.includes("Type a caption"), "type-to-send caption fallback");
  assert(appJs.includes("Chrome on Android"), "Android Chrome is best for live speech");
  assert(appJs.includes("iPhone"), "iPhone join is documented in the UI");
  assert(
    appJs.includes("Type a caption — Send still reaches every phone and the TV."),
    "iPhone mic failure tells you to type",
  );
  assert(appJs.includes("(no-speech)"), "iPhone no-speech is shown instead of swallowed");
  assert(appJs.includes("documentElement"), "iPhone speech sets the page language before es-ES / pt-BR");
  assert(appJs.includes("Safari rejected"), "rejected speech locale is named");
  assert(appJs.includes("phone-live-board"), "host phone shows EN ES PT caption panes");
  assert(appJs.includes("join-screen"), "guest join is a phone layout, not Fold-only");
  assert(appJs.includes("data-join-setup"), "join questions come before the caption board");
  assert(appJs.includes("What language are you speaking?"), "join asks spoken language first");
  assert(appJs.includes("What language do you want to watch?"), "join asks watch language first");
  assert(appJs.includes("data-join-continue"), "join setup has one continue button");
  assert(!appJs.includes("join-dock-pin"), "join does not pin the caption board over the dock");
  assert(!appJs.includes("--join-vvh"), "join does not lock to a measured viewport height");
  assert(appJs.includes("Offline / Local meeting"), "offline / local meeting toggle");
  assert(appJs.includes("Offline translate (limited phrases)"), "offline translate banner");
  assert(appJs.includes("npm run build"), "laptop setup npm run build");
  assert(appJs.includes("http://LAPTOP-LAN-IP:PORT"), "laptop LAN URL");
  assert(appJs.includes("Meeting Translator"), "footer branding");
  assert(
    appJs.includes("Now open system Smart View → My TV. TV will mirror these captions."),
    "Smart View mode tip",
  );
  assert(!appJs.includes("PresentationRequest"), "no Presentation API");
  assert(!/\.requestSession\b/.test(appJs), "no presentation requestSession");
  assert(!appJs.includes("startSmartView"), "no Smart View launch helper");
  assert(!appJs.includes("android.settings.CAST_SETTINGS"), "no Android Cast intent");
  assert(!appJs.includes("com.samsung.android.smartmirroring"), "no Samsung Smart View intent");
  assert(appJs.includes('dataset.orientation'), "Smart View orientation flag");

  const cssSrc = home.body.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
  assert(cssSrc, "built app css");
  const { body: appCss } = await text(cssSrc);
  assert(
    appCss.includes("[data-orientation=\"landscape\"]") ||
      appCss.includes('[data-orientation=landscape]'),
    "Smart View landscape keeps language panes",
  );
  assert(appCss.includes("smart-view-source-chip"), "Smart View spoken language chip style");
  assert(appCss.includes("join-screen"), "guest join screen class");
  assert(appCss.includes("join-setup"), "join setup screen is styled");
  assert(
    appCss.includes(".screen[hidden]") &&
      appCss.includes(".join-setup[hidden]") &&
      appCss.includes(".join-screen[hidden]") &&
      /display:\s*none\s*!important/.test(appCss),
    "hidden join screens stay display none when .screen sets display",
  );
  assert(appJs.includes("data-setup-watch-lang"), "setup watch chips use their own attribute");
  assert(appJs.includes("[data-setup-watch]"), "setup watch container keeps its own selector");
  assert(!appJs.includes('data-setup-watch="${'), "setup watch chips do not reuse the container attribute");
  assert(
    !/phone-screen:not\(\.is-smart-view\)\{[^}]*overflow:\s*hidden/.test(appCss.replace(/\s+/g, "")),
    "host phone screen does not lock the viewport",
  );
  assert(!appCss.includes("join-dock-pin"), "join dock is not a pinned layer");
  assert(!appCss.includes("--join-vvh"), "join is not locked to a visual-viewport variable");
  assert(!/position:\s*fixed/.test(appCss), "join does not use a fixed lock overlay");
  assert(appCss.includes("join-watch"), "join Watch controls are styled");
  assert(
    appCss.includes('.join-screen .tv-board[data-count="1"]') ||
      appCss.includes(".join-screen .tv-board[data-count=1]"),
    "single Watch pane fills the join board",
  );
  assert(appCss.includes("phone-live-board"), "host caption panes are styled");
  assert(appCss.includes("100svh"), "iOS small viewport height");
  assert(appCss.includes("safe-area-inset-top") && appCss.includes("safe-area-inset-bottom"), "safe area insets");
  assert(appCss.includes("repeat(3,minmax(0,1fr))") || appCss.includes("repeat(3, minmax(0, 1fr))"), "triple pane columns");
  assert(appCss.includes("is-lang-lock") && appCss.includes(".line.faded"), "lang-lock shows latest caption");
  assert(!appCss.includes("min(28vh, 10rem)"), "caption panes are not clipped to 10rem");
  assert(!appCss.includes("min(30vh, 7.5rem)"), "caption panes are not clipped to 7.5rem");

  const { body: manifestText } = await text("/manifest.webmanifest");
  const manifest = JSON.parse(manifestText);
  assert(manifest.name === "Meeting Translator", "manifest name");
  assert(manifest.short_name === "Meeting Translator", "manifest short_name");
  assert(manifest.display === "standalone", "manifest display");
  assert(manifest.start_url === "/", "manifest start_url");
  assert(manifest.theme_color === "#0b1214", "manifest theme");
  assert(
    manifest.icons?.some((icon) => icon.sizes === "192x192" && icon.src.endsWith(".png")),
    "192 icon",
  );
  assert(
    manifest.icons?.some((icon) => icon.sizes === "512x512" && icon.src.endsWith(".png")),
    "512 icon",
  );

  const { body: sw } = await text("/sw.js");
  assert(sw.includes('addEventListener("fetch"'), "service worker fetch handler");
  assert(sw.includes("/caption-ws"), "service worker skips relay");
  assert(sw.includes("/api/translate"), "service worker skips translate API");
  const retiredApi = "/api/" + retired + "-hand" + "out";
  assert(!sw.includes(retiredApi), "service worker has no retired route");

  const translateStatus = await json("/api/translate");
  assert(translateStatus.provider === health.translate, "GET /api/translate provider");

  const translateRes = await fetch(`${base}/api/translate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "Welcome everyone. Thank you for coming tonight. Let us begin.",
      from: "en",
    }),
  });
  assert(translateRes.ok, "POST /api/translate");
  const translated = await translateRes.json();
  assert(translated.text?.en?.includes("Welcome everyone"), "source language passthrough");
  assert(Boolean(translated.text?.es && translated.text?.pt), "es/pt present");
  if (translated.provider === "mock") {
    assert(String(translated.text.es).toLowerCase().includes("bienvenidos"), "mock es");
    assert(String(translated.text.pt).toLowerCase().includes("bem-vind"), "mock pt");
  }
  if (translated.provider === "mymemory" || translated.provider === "mint") {
    assert(String(translated.text.es).trim() !== translated.text.en, `${translated.provider} es differs from en`);
    assert(String(translated.text.pt).trim() !== translated.text.en, `${translated.provider} pt differs from en`);
  }

  for (const sample of [
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
  ]) {
    const res = await fetch(`${base}/api/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: sample.text, from: sample.from }),
    });
    assert(res.ok, `POST /api/translate free-form ${sample.from}`);
    const body = await res.json();
    assert(
      body.provider === "mymemory" || body.provider === "mint" || body.provider === "deepl" || body.provider === "google",
      `free-form ${sample.from} provider ${body.provider} should be live MT, not mock`,
    );
    assert(String(body.text[sample.from] || "").includes(sample.text.slice(0, 8)), `${sample.from} pane keeps source`);
    for (const [to, pattern] of Object.entries(sample.expect)) {
      const value = String(body.text[to] || "");
      assert(value.trim() !== sample.text, `free-form ${sample.from}->${to} identity`);
      assert(pattern.test(value), `free-form ${sample.from}->${to}: ${value}`);
    }
  }

  const healthAfter = await json("/health");
  const translateStatusAfter = await json("/api/translate");
  assert(
    healthAfter.translate === translateStatusAfter.provider,
    "health and GET /api/translate stay aligned after live captions",
  );
  assert(
    healthAfter.translate === "deepl" ||
      healthAfter.translate === "mymemory" ||
      healthAfter.translate === "mint" ||
      healthAfter.translate === "google" ||
      healthAfter.translate === "mock",
    "health reports a known live provider after translate",
  );

  for (const sample of [
    { from: "es", text: "Bienvenidos a todos", expectEn: /welcome|everyone/i, other: "pt", otherPat: /bem-vind|todos/i },
    { from: "pt", text: "Bem-vindos a todos", expectEn: /welcome|everyone/i, other: "es", otherPat: /bienvenid|todos/i },
  ]) {
    const res = await fetch(`${base}/api/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: sample.text, from: sample.from }),
    });
    assert(res.ok, `POST /api/translate ${sample.from}`);
    const body = await res.json();
    assert(sample.expectEn.test(String(body.text.en)), `${sample.from}→en: ${body.text.en}`);
    assert(sample.otherPat.test(String(body.text[sample.other])), `${sample.from}→${sample.other}: ${body.text[sample.other]}`);
    assert(String(body.text[sample.from]).toLowerCase().includes(sample.text.slice(0, 6).toLowerCase()), `${sample.from} pane keeps source`);
  }

  const mockRes = await fetch(`${base}/api/translate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "Welcome everyone. Thank you for coming tonight. Let us begin.",
      from: "en",
      provider: "mock",
    }),
  });
  assert(mockRes.ok, "POST /api/translate provider=mock");
  const mocked = await mockRes.json();
  assert(mocked.provider === "mock", "client can force mock without env");
  assert(String(mocked.text.es).toLowerCase().includes("bienvenidos"), "forced mock es");
  assert(String(mocked.text.pt).toLowerCase().includes("bem-vindos"), "forced mock pt");

  const anyDirection = [
    {
      from: "es",
      text: "Bienvenidos a todos. Gracias por venir esta noche.",
      expect: { en: /welcome|thank|coming/i, pt: /bem-vind|obrigado|noite/i },
    },
    {
      from: "pt",
      text: "Bem-vindos a todos. Obrigado por vir esta noite.",
      expect: { en: /welcome|thank|coming/i, es: /bienvenid|gracias|noche/i },
    },
  ];
  for (const sample of anyDirection) {
    const res = await fetch(`${base}/api/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: sample.text, from: sample.from, provider: "mock" }),
    });
    assert(res.ok, `POST /api/translate mock ${sample.from}`);
    const body = await res.json();
    assert(body.from === sample.from, `mock ${sample.from} from echo`);
    assert(String(body.text[sample.from]).includes(sample.text.slice(0, 10)), `mock ${sample.from} pane keeps source`);
    for (const [to, pattern] of Object.entries(sample.expect)) {
      const value = String(body.text[to] || "");
      assert(value.trim() && value.trim() !== sample.text, `mock ${sample.from}->${to} translated`);
      assert(pattern.test(value), `mock ${sample.from}->${to} unexpected: ${value}`);
    }
  }

  const wrongHint = await fetch(`${base}/api/translate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "Bienvenidos a todos. Gracias por venir esta noche.",
      from: "en",
      provider: "mock",
    }),
  });
  assert(wrongHint.ok, "POST /api/translate Spanish with from=en");
  const rescued = await wrongHint.json();
  assert(/welcome|thank/i.test(String(rescued.text.en)), `EN pane English when source is Spanish: ${rescued.text.en}`);
  assert(/bienvenid|gracias/i.test(String(rescued.text.es)), "ES pane stays Spanish when detect overrides from=en");
  const leaked =
    JSON.stringify(translated).includes("GOOGLE_TRANSLATE") ||
    JSON.stringify(translated).includes("DEEPL_API_KEY") ||
    JSON.stringify(translated).includes("DEEPL_AUTH") ||
    JSON.stringify(translated).includes("AIza");
  assert(!leaked, "translate response must not include a key");

  const gone = await fetch(`${base}${retiredApi}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert(gone.status === 405, "retired route is not an API");

  for (const icon of ["/icon-192.png", "/icon-512.png", "/icon-192-maskable.png", "/icon-512-maskable.png"]) {
    const res = await fetch(`${base}${icon}`);
    assert(res.ok, icon);
    assert(res.headers.get("content-type")?.includes("png"), `${icon} content-type`);
  }

  const phoneWs = await connect("phone", "GN7K");
  const tvWs = await connect("tv", "GN7K");
  await waitFor(phoneWs.inbox, "joined");
  await waitFor(tvWs.inbox, "joined");

  const layoutState = {
    room: "GN7K",
    sourceLang: "en",
    layout: "en-es-pt",
    listening: false,
    lines: [],
    extraSheet: { id: "should-drop" },
  };
  phoneWs.ws.send(JSON.stringify({ type: "push", state: layoutState }));
  const delivered = await waitFor(tvWs.inbox, "state", (msg) => msg.state?.layout === "en-es-pt");
  assert(delivered.state?.layout === "en-es-pt", "room layout reached the TV");
  assert(delivered.state?.extraSheet === undefined, "unknown sheet payload is dropped");
  assert(!(retired in (delivered.state || {})), "room state has no extra curriculum field");

  const captionRoom = "LNGK";
  const captionPhone = await connect("phone", captionRoom);
  const tvCombined = await connect("tv", captionRoom);
  const tvEs = await connect("tv", captionRoom);
  const tvPt = await connect("tv", captionRoom);
  await waitFor(captionPhone.inbox, "joined");
  await waitFor(tvCombined.inbox, "joined");
  await waitFor(tvEs.inbox, "joined");
  await waitFor(tvPt.inbox, "joined");
  const captionState = {
    room: captionRoom,
    sourceLang: "en",
    layout: "en-es-pt",
    listening: true,
    lines: [
      {
        id: "line-1",
        isFinal: true,
        at: Date.now(),
        text: {
          en: "Welcome everyone.",
          es: "Bienvenidos a todos.",
          pt: "Bem-vindos a todos.",
        },
      },
    ],
  };
  captionPhone.ws.send(JSON.stringify({ type: "push", state: captionState }));
  const matchCaption = (msg) => msg.state?.lines?.[0]?.text?.es === "Bienvenidos a todos.";
  const toCombined = await waitFor(tvCombined.inbox, "state", matchCaption);
  const toEs = await waitFor(tvEs.inbox, "state", matchCaption);
  const toPt = await waitFor(tvPt.inbox, "state", matchCaption);
  assert(toCombined.state?.layout === "en-es-pt", "combined TV still gets room layout");
  assert(toEs.state?.layout === "en-es-pt", "lang window still receives full room layout");
  assert(toEs.state?.lines?.[0]?.text?.en === "Welcome everyone.", "ES window still receives EN text");
  assert(String(toEs.state?.lines?.[0]?.text?.pt || "").includes("todos"), "ES window still receives PT text");
  assert(toPt.state?.lines?.[0]?.text?.es === "Bienvenidos a todos.", "PT window still receives ES text");
  assert(toCombined.state?.lines?.[0]?.text?.pt === toPt.state?.lines?.[0]?.text?.pt, "all TVs get the same caption stream");
  assert(toCombined.state?.lines?.[0]?.speaker === undefined, "a caption without a speaker is not given a blank label");

  const floorRoom = "FLRA";
  const hostWs = await connect("phone", floorRoom);
  const guestA = await connect("guest", floorRoom, "Carlos");
  const guestB = await connect("guest", floorRoom, "Luis");
  const floorTv = await connect("tv", floorRoom);
  const hostJoined = await waitFor(hostWs.inbox, "joined");
  const guestAJoined = await waitFor(guestA.inbox, "joined");
  await waitFor(guestB.inbox, "joined");
  await waitFor(floorTv.inbox, "joined");
  assert(Boolean(hostJoined.peerId), "host receives peerId");
  assert(guestAJoined.role === "guest", "guest join role");

  hostWs.ws.send(
    JSON.stringify({
      type: "push",
      state: {
        room: floorRoom,
        sourceLang: "en",
        layout: "en-es-pt",
        listening: false,
        lines: [],
        extraSheet: { id: "should-drop" },
      },
    }),
  );
  const hostLayout = await waitFor(guestA.inbox, "state", (msg) => msg.state?.layout === "en-es-pt");
  assert(!("extraSheet" in (hostLayout.state || {})), "guests do not receive an extra sheet");

  guestA.ws.send(JSON.stringify({ type: "floor", action: "claim", name: "Carlos" }));
  const guestAFloor = await waitFor(guestA.inbox, "floor", (msg) => msg.ok === true);
  assert(guestAFloor.floor?.holderName === "Carlos", "guest A holds the floor");
  const claimSnap = await waitFor(
    hostWs.inbox,
    "state",
    (msg) => msg.state?.floor?.holderId === guestAJoined.peerId,
  );
  assert(claimSnap.state?.floor?.holderName === "Carlos", "join claim snapshot names the guest on the host, not a stale empty floor");

  guestB.ws.send(JSON.stringify({ type: "floor", action: "claim", name: "Luis" }));
  const guestBBusy = await waitFor(guestB.inbox, "floor", (msg) => msg.ok === false);
  assert(guestBBusy.reason === "busy", "second guest cannot take the mic");
  assert(guestBBusy.floor?.holderName === "Carlos", "busy result still names the speaker");

  guestB.ws.send(
    JSON.stringify({
      type: "push",
      state: {
        room: floorRoom,
        sourceLang: "es",
        listening: true,
        layout: "en",
        lines: [
          {
            id: "guest-b-should-not-land",
            isFinal: true,
            at: Date.now(),
            text: { en: "Nope", es: "Nope", pt: "Nope" },
          },
        ],
      },
    }),
  );
  await delay(200);
  assert(
    !hostWs.inbox.some((msg) => msg.state?.lines?.[0]?.id === "guest-b-should-not-land"),
    "guest without the floor cannot push captions",
  );

  guestA.ws.send(
    JSON.stringify({
      type: "push",
      state: {
        room: floorRoom,
        sourceLang: "es",
        listening: true,
        layout: "pt",
        lines: [
          {
            id: "guest-a-line",
            isFinal: true,
            at: Date.now(),
            speaker: "  Ada  ",
            note: "drop-me",
            text: { en: "Peace to you friends.", es: "Paz a ustedes amigos.", pt: "Paz a vocês amigos." },
          },
        ],
      },
    }),
  );
  const guestCaption = await waitFor(hostWs.inbox, "state", (msg) => msg.state?.lines?.[0]?.id === "guest-a-line");
  const tvCaption = await waitFor(floorTv.inbox, "state", (msg) => msg.state?.lines?.[0]?.id === "guest-a-line");
  const otherGuestCaption = await waitFor(guestB.inbox, "state", (msg) => msg.state?.lines?.[0]?.id === "guest-a-line");
  assert(!("extraSheet" in (guestCaption.state || {})), "guest speaker cannot attach a sheet");
  assert(guestCaption.state?.layout === "en-es-pt", "guest speaker cannot wipe host layout");
  assert(guestCaption.state?.sourceLang === "es", "speaker sourceLang is the guest spoken language");
  assert(tvCaption.state?.lines?.[0]?.text?.es === "Paz a ustedes amigos.", "TV shows guest captions");
  assert(otherGuestCaption.state?.lines?.[0]?.text?.en === "Peace to you friends.", "other guest sees captions");
  assert(guestCaption.state?.floor?.holderName === "Carlos", "floor holder name rides on state");
  assert(tvCaption.state?.lines?.[0]?.speaker === "Ada", "relay keeps the caption speaker for the TV");
  assert(guestCaption.state?.lines?.[0]?.speaker === "Ada", "relay keeps the caption speaker for phones");
  assert(!("note" in (tvCaption.state?.lines?.[0] || {})), "unknown caption fields are dropped without dropping speaker");

  hostWs.ws.send(JSON.stringify({ type: "floor", action: "force" }));
  const hostForce = await waitFor(hostWs.inbox, "floor", (msg) => msg.ok === true && msg.floor?.holderId === hostJoined.peerId);
  assert(hostForce.floor?.holderName === "Host", "host reclaim takes the floor");
  await waitFor(guestA.inbox, "floor", (msg) => msg.floor && msg.floor.holderId === hostJoined.peerId);

  guestB.ws.send(JSON.stringify({ type: "floor", action: "claim", name: "Luis" }));
  const guestBStillBusy = await waitFor(
    guestB.inbox,
    "floor",
    (msg) => msg.ok === false && msg.reason === "busy" && msg.floor?.holderId === hostJoined.peerId,
  );
  assert(guestBStillBusy.reason === "busy", "guest cannot start while host holds the floor");

  hostWs.ws.send(JSON.stringify({ type: "floor", action: "release" }));
  await waitFor(guestB.inbox, "floor", (msg) => msg.floor && msg.floor.holderId === null);
  guestB.ws.send(JSON.stringify({ type: "floor", action: "claim", name: "Luis" }));
  const guestBClaim = await waitFor(guestB.inbox, "floor", (msg) => msg.ok === true);
  assert(guestBClaim.floor?.holderName === "Luis", "floor is free after host release");

  const guestSpoken = [];
  async function guestPublishes(id, sourceLang, text) {
    guestSpoken.push({ id, isFinal: true, at: Date.now(), text });
    guestB.ws.send(
      JSON.stringify({
        type: "push",
        state: {
          room: floorRoom,
          sourceLang,
          listening: true,
          lines: guestSpoken,
        },
      }),
    );
    const hostMsg = await waitFor(hostWs.inbox, "state", (msg) => msg.state?.lines?.some((line) => line.id === id));
    assert(hostMsg.state?.sourceLang === sourceLang, `host receives guest ${sourceLang} after releasing the floor`);
    const tvMsg = await waitFor(floorTv.inbox, "state", (msg) => msg.state?.lines?.some((line) => line.id === id));
    assert(tvMsg.state?.sourceLang === sourceLang, `TV receives guest ${sourceLang} after the host released`);
    return hostMsg;
  }
  await guestPublishes("guest-en-after-host", "en", {
    en: "Welcome everyone.",
    es: "Bienvenidos a todos.",
    pt: "Bem-vindos a todos.",
  });
  const hostSeesGuestEs = await guestPublishes("guest-es-after-host", "es", {
    en: "Peace to you friends.",
    es: "Paz a ustedes amigos.",
    pt: "Paz a vocês amigos.",
  });
  assert(
    hostSeesGuestEs.state?.lines?.find((line) => line.id === "guest-es-after-host")?.text?.es === "Paz a ustedes amigos.",
    "join-role caption is on the host",
  );
  const hostSeesGuestPt = await guestPublishes("guest-pt-after-host", "pt", {
    en: "Good night friends.",
    es: "Buenas noches amigos.",
    pt: "Boa noite amigos.",
  });
  assert(
    ["guest-en-after-host", "guest-es-after-host", "guest-pt-after-host"].every((id) =>
      hostSeesGuestPt.state?.lines?.some((line) => line.id === id),
    ),
    "host keeps the guest EN → ES → PT captions",
  );

  const dropRoom = "FLRB";
  const stayHost = await connect("phone", dropRoom);
  const dropGuest = await connect("guest", dropRoom, "Marco");
  await waitFor(stayHost.inbox, "joined");
  await waitFor(dropGuest.inbox, "joined");
  dropGuest.ws.send(JSON.stringify({ type: "floor", action: "claim", name: "Marco" }));
  await waitFor(stayHost.inbox, "floor", (msg) => msg.floor?.holderName === "Marco");
  dropGuest.ws.close();
  await waitFor(stayHost.inbox, "floor", (msg) => msg.floor && msg.floor.holderId === null);

  phoneWs.ws.close();
  tvWs.ws.close();
  captionPhone.ws.close();
  tvCombined.ws.close();
  tvEs.ws.close();
  tvPt.ws.close();
  hostWs.ws.close();
  guestA.ws.close();
  guestB.ws.close();
  floorTv.ws.close();
  stayHost.ws.close();
  console.log(`OK ${base} — PWA shell, phone/TV/join routes, Send to TV + Smart View mode, guest join + floor control, relay, translate=${health.translate}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of started) child.kill("SIGTERM");
    process.exit(process.exitCode ?? 0);
  });
