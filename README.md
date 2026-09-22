# Meeting Translator

Live multilingual meeting captions (English / Spanish / Portuguese). A phone captures the speaker. Every phone shows **EN | ES | PT**. A TV joins the same room in its own browser.

## How it works

![Meeting Translator — how it works](docs/architecture.svg)

[Meeting runbook](docs/MEETING_RUNBOOK.md)

- **Host phone:** Chrome on Android (or the installed PWA) creates the room, picks spoken language **EN / ES / PT**, and owns **Send to TV**, **Smart View mode**, and **Join on phones**. The host screen shows the same three caption panes as the TV, not an English-only preview.
- **Guest phones (Android or iPhone):** scan **Join on phones** (`/?view=join&room=ABCD`). Before the caption board they answer **What language are you speaking?** and **What language do you want to watch?** (one language or all three), optionally a name, then **Join**. Spoken is for the mic and Type + Send. Watch is only the captions on that phone. They can change both after they are in the room. One speaker at a time. The host can **Reclaim mic**. Chrome on Android is best for live speech. iPhone can always watch and can **Type + Send** if Web Speech fails. Safari often shows the words on that phone without ever marking them final; the phrase is sent when the utterance ends (or when the interim stalls) so other phones and the TV still get a finished caption, not every draft. Safari keeps the first `webkitSpeechRecognition` and only changes `lang` (`es-ES` / `pt-BR`). Android and desktop may build a new recognizer.
- **TV browser:** **Send to TV** shows a QR and link (`/?view=tv&room=ABCD`) so the TV’s own browser opens the room. Default layout is combined **EN | ES | PT**. Optional one-language-per-monitor links do not change the other screens. The TV shows **final** captions only.
- **Smart View mode:** the phone itself switches to the large caption layout while the mic keeps running. Then you open system Smart View so the TV mirrors that screen. This app does not call the Presentation API or launch a cast.
- **One Node process:** HTTP, the `/caption-ws` room relay, and `POST /api/translate` stay together. Phone and TV must hit the same process.
- **Translators (server order):** DeepL when `DEEPL_API_KEY` is set → MyMemory (free, daily limit) → MinT (Wikimedia, no key) → built-in mock dictionary. `GET /health` and `GET /api/translate` report the provider that actually served the last caption. The phone’s limited-phrase banner appears only when captions are truly on mock.

## Create a room, join, and show the TV

1. On the host phone, open the public HTTPS URL and tap **Create room on this phone**.
2. Tap **Join on phones** and let everyone scan the QR (Android Chrome or iPhone Safari). Each person answers spoken language and watch language, then taps **Join**. Only one mic is live; the host can reclaim it.
3. Tap **Send to TV**. On the TV browser, scan that QR or paste the link. You should see **EN | ES | PT**.
4. If the TV can only mirror the phone, tap **Smart View mode**, then open system Smart View → My TV. Exit the mode to get the controls back. The mic does not stop when you enter or leave it.
5. Optional: from **Send to TV**, copy the EN, ES, and PT links onto separate monitors. Each window is full-screen for that language and still uses the same room.

Demo line (DeepL, MyMemory, and the built-in dictionary):

> Welcome everyone. Thank you for coming tonight. Let us begin.

## Host a public URL

Production is one Node server (`server/index.ts`):

```bash
npm install
npm run build
npm start          # PORT=8080 HOST=0.0.0.0 by default
```

Keep **exactly one instance**. Two replicas mean the phone and the TV can land on different memories and never see each other.

### Render

`render.yaml` defines a **Web Service** named `meeting-translator-captions` (not a Static Site, and not any other captions service).

1. In Render, create a new Blueprint or a new Web Service from this repo.
2. Build: `npm ci && npm run build`. Start: `npm start`. Node 22. Health check: `/health`.
3. In the service environment, set `TRANSLATE_PROVIDER=deepl` and `DEEPL_API_KEY` (the real key from your DeepL account). Do not commit the key. Never put it in a `VITE_*` variable.
4. Instance count: **1**. Free instances sleep.

**Cold start:** open the URL about a minute before the meeting so Render wakes the free instance. The first request after sleep can take a while. Do not deploy mid-meeting.

Confirm `GET /health` shows `"translate":"deepl"` after the key is set and the service has restarted. Without a key, the app uses MyMemory, then MinT, then mock.

### Fly.io and Railway

`fly.toml` and `railway.toml` are the same single-process shape, with app name `meeting-translator-captions`. Scale to one machine. Fly sleeps when idle (`auto_stop_machines = "stop"`); open the URL early or set `min_machines_running = 1` for the meeting.

```bash
fly launch --ha=false --copy-config --yes
fly deploy --ha=false
fly scale count 1
fly secrets set TRANSLATE_PROVIDER=deepl DEEPL_API_KEY=your-deepl-key-here
```

## Translation

The phone calls `POST /api/translate` on the same host before it publishes a caption. Keys stay on the server. Copy `.env.example` to `.env` for local runs.

| Server env | Behavior |
| --- | --- |
| `TRANSLATE_PROVIDER=deepl` + `DEEPL_API_KEY` | DeepL (recommended). Free keys end with `:fx` and use `https://api-free.deepl.com`. `DEEPL_AUTH_KEY` is accepted as an alias. Optional `DEEPL_API_URL` for Pro. |
| *(unset)* or `TRANSLATE_PROVIDER=mymemory`, or DeepL requested with no key | MyMemory, then MinT, then mock. |
| `TRANSLATE_PROVIDER=mint` | MinT, then mock. |
| `TRANSLATE_PROVIDER=mock` | Built-in dictionary. Same path as **Offline / Local meeting**. |
| `TRANSLATE_PROVIDER=google` + `GOOGLE_TRANSLATE_API_KEY` | Cloud Translation API v2, then the free fallbacks. |

`GET /health` does not return the key. It reports `deepl`, `mymemory`, `mint`, `google`, or `mock` for the provider actually serving captions.

Portuguese targets use DeepL `PT-BR`. English targets use `EN-US`.

## Laptop without public internet

```bash
npm install
npm run build
npm start
```

Open `http://LAPTOP-LAN-IP:8080` on the phones and the TV. Turn on **Offline / Local meeting**. Speech recognition may still need the phone’s speech service. Type a caption if the mic cannot start. The room relay is this laptop — devices cannot stay on a public URL that they cannot reach.

## iPhone speech

Start recognition inside the tap, before the floor claim finishes. If Safari rejects Spanish or Portuguese, the phone names `es-ES` or `pt-BR`. The first `webkitSpeechRecognition` instance is kept and only `lang` changes. **Type + Send** does not use Web Speech and still reaches the other phones and the TV.

## Verify

```bash
npm run verify:prod
npm run verify:translate -- --offline
npm run verify:translate
```

`verify:prod` checks the PWA shell, phone / TV / join routes, Send to TV, Smart View, one speaker at a time, floor claim (the snapshot names the new holder), and translate. `verify:translate` checks provider order and EN / ES / PT. `--offline` skips live MyMemory and MinT calls.

## Scripts

```bash
npm run dev          # HTTPS Vite + relay
npm run dev:http     # HTTP (MT_HTTPS=0)
npm run build        # typecheck + production bundle
npm start            # static PWA + relay
npm run preview
npm run verify:prod
npm run verify:translate
npm run icons
```

## PWA

- Manifest name and short name: **Meeting Translator**. Standalone display. Theme `#0b1214`. 192 and 512 icons, including maskable.
- Service worker caches the app shell. Live captions still need the network.
- Routes stay inside `/`: `/?view=phone&room=ABCD`, `/?view=tv&room=ABCD`, optional `&lang=es`, `/?view=join&room=ABCD`.
