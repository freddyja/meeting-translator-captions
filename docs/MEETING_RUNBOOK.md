# Meeting runbook

Use this on the day of the meeting. The public URL is the Render service for **this** repo (`meeting-translator-captions`), not any other captions host.

## Before people arrive

1. Open the public URL in a browser about a minute early. Render’s free instance sleeps when idle, and the first request wakes it. A cold start can take half a minute. Do not deploy during the meeting — a new process drops the in-memory room.
2. Confirm `GET /health` returns `"ok": true` and `"translate"` is the provider you expect (`deepl` when `DEEPL_API_KEY` is set). The phone’s limited-phrase banner appears only when captions are actually on the mock dictionary.
3. On the host phone, use **Chrome on Android**. On iPhone, Safari can watch and type. Keep the host phone plugged in if you can.

## Create the room

1. On the host phone, open Meeting Translator and tap **Create room**.
2. Note the 4-letter room code. The phone shows **EN | ES | PT** caption panes. On a narrow phone the page scrolls, so Spoken language, TV layout, Smart View, and Join on phones stay reachable.
3. Pick **Spoken language** (EN, ES, or PT) before you speak. Switching language while the mic is on retargets speech recognition. On iPhone the first recognizer is reused and only its `lang` changes (`en-US`, `es-ES`, `pt-BR`). The Spoken choice writes that language before Start.

## Guests join

1. On the host phone, tap **Join on phones**.
2. Guests scan the QR or open the copied link (`/?view=join&room=ABCD`) in Chrome on Android or Safari / Chrome on iPhone. No app-store install.
3. Each phone asks what language they are speaking and what language they want to watch (English, Español, Português, or all three), then **Join**. Watch changes only that phone. Spoken is used when they talk or type. They can change both from the caption screen.
4. One speaker at a time. If someone else holds the mic, the phone says **Someone else is speaking**. The host can tap **Reclaim mic**.
5. On iPhone, **Type a caption** and **Send** is always available. Start speech recognition inside the same tap that claims the floor. Safari may show the phrase only on that phone, withhold a final result, or end it as no-speech — the app still sends the heard words, so the other phones and the TV get one finished line. Silence with no words stays on screen and is not sent. If the mic never starts, or Safari rejects a locale, type the caption instead.

## Send to TV

1. On the host phone, tap **Send to TV**.
2. On the TV’s own browser, scan the QR or open the copied link (`/?view=tv&room=ABCD`).
3. The TV shows finished captions only — not interim speech drafts — in the layout the host picked. The default is **EN | ES | PT**.
4. Optional: **One language per monitor** copies extra links (`&lang=en`, `&lang=es`, `&lang=pt`). Each window still joins the same room. Other screens keep the combined layout.

## Smart View

Samsung Smart View (and similar screen mirror) can only mirror the phone. It does not open a second page, and this app does not launch a cast session.

1. Tap **Smart View mode**. The phone switches to the large caption layout and the mic keeps running.
2. Open system Smart View → My TV from the phone quick panel so the TV mirrors those captions.
3. Spoken-language chips stay on the bar. **Exit Smart View mode** returns to the controls. The mic does not stop just because you entered or left this mode.

Use **Send to TV** when the TV has a browser. Use **Smart View mode** only when the TV will mirror the phone.

## If the network is down

On a laptop that shares Wi-Fi or a hotspot with the phones and the TV:

```bash
npm install
npm run build
npm start
```

Open `http://LAPTOP-LAN-IP:8080` on each device. Turn on **Offline / Local meeting** so captions use the built-in dictionary. Live speech may still need the phone’s speech service. Type a caption if the mic cannot start.

## After the meeting

Leave the room. Nothing is stored. The room disappears when the last connection closes, and a sleeping Render instance drops it anyway.
