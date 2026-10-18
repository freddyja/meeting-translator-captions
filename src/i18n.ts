import { escapeHtml } from "./dom.ts";
import { LANG_LABEL, type Lang } from "./types.ts";

/**
 * App language (was "Interface") — the labels on the screens. This is not
 * "I speak" (was Spoken) and not "Show captions in" (was Watch).
 * "I speak" still sets the microphone recognizer (en-US / es-ES / pt-BR).
 * "Show captions in" still chooses which caption panes this phone shows.
 *
 * The choice is saved on this device (`mt-ui-lang`). With nothing saved, the
 * browser language is used when it is English, Spanish, or Portuguese;
 * otherwise the screens stay in English.
 *
 * Recognizer errors stay English inside the speech code (so the mic fallback
 * checks keep working) and are translated only when they are shown.
 */

export const UI_LANG_STORAGE_KEY = "mt-ui-lang";

export type UiLang = "en" | "es" | "pt";

const en = {
  uiLangLabel: "App language",
  uiLangGroup: "App language",
  uiLangHint: "Changes the words on this phone only. “I speak” still sets the microphone language.",
  uiLangTagline:
    "Break language barriers in your small groups. No equipment needed - works on any device.",
  homeLede:
    "Live multilingual meeting captions. A phone captures the speaker; every phone and the TV show English, Spanish, and Portuguese windows.",
  createRoom: "Create room",
  haveRoomCode: "Have a room code?",
  roomCode: "Room code",
  openTvWindows: "Show captions on this screen (TV)",
  joinThisPhone: "Join",
  homeHint: "The host creates a room on a phone. Guests scan the QR code with their phone camera — no app store needed. <strong>Send to TV</strong> shows big captions on the TV.",
  meetingMode: "Meeting mode",
  offlineLocal: "Offline / Local meeting",
  offlineAria: "Offline / Local meeting — use the built-in dictionary, works without internet",
  offlineBannerBefore: "Offline translation knows a limited set of phrases. More help: ",
  laptopSteps: "Advanced setup",
  offlineBannerAfter: ".",
  offlineHint: "On: uses the built-in dictionary (fewer phrases, no internet needed). Off: uses the online translator.",
  offlineLimited: "Offline translation (limited phrases).",
  installTitle: "Install on this phone",
  installApp: "Install app",
  installStandaloneCopy:
    "This is the installed Meeting Translator app. Create a room here, then open the TV link on the meeting TV.",
  installStandalone1: "Tap <strong>Create room</strong>.",
  installStandalone2: "Use <strong>Send to TV</strong> to show big captions on the TV.",
  installStandalone3: "Keep this app open on the screen while you speak.",
  installDoneCopy: "Installed. Open Meeting Translator from your home screen.",
  installDone1: "Find the <strong>Meeting Translator</strong> icon on the home screen.",
  installDone2: "Open it — it fills the whole screen like any other app.",
  installDone3: "Create a room, then open the TV link on the TV.",
  installGuideCopy: "Add Meeting Translator to the home screen like a normal app. Then the meeting is one tap away.",
  installReady1: "Tap <strong>Install app</strong> above and confirm.",
  installReady2: "Open <strong>Meeting Translator</strong> from the home screen.",
  installReady3: "Create the room on the phone, then open the TV link on the TV.",
  installManual1: "On iPhone, use Safari. On Android, use your phone's main web browser.",
  installManual2:
    "Tap the browser menu → <strong>Install app</strong> or <strong>Add to Home screen</strong>.",
  installManual3: "Open <strong>Meeting Translator</strong> from the home screen, then create a room.",
  localTitle: "Advanced: run without internet",
  localIntro:
    "No public internet? Run the app on a laptop. Phones and the TV open that laptop on the same Wi‑Fi or phone hotspot.",
  copyCommands: "Copy commands",
  copied: "Copied",
  localStep1:
    "On the laptop, in this repo, paste those three commands. <code>npm start</code> listens on port <strong>8080</strong> (<code>HOST=0.0.0.0</code>).",
  localStep2:
    "Find the laptop’s LAN IP (macOS: System Settings → Wi‑Fi → Details; Windows: <code>ipconfig</code>; Linux: <code>ip addr</code>).",
  localStep3:
    "On each phone and the TV, open <code>http://LAPTOP-LAN-IP:PORT</code> — usually <code>http://192.168.x.x:8080</code> — while they share that Wi‑Fi or hotspot.",
  localHereBefore: "This device is already on ",
  localHereAfter: " — use that URL on the phones and TV if they share this network.",
  localMicHint:
    "Use <strong>Chrome</strong> for the mic. Speech recognition may still need a network path to the device’s speech service (Chrome / Google), depending on the phone. That is not fully offline. <strong>Type a caption</strong> and Send if the mic cannot reach a recognizer.",
  localOfflineHint: "Turn on <strong>Offline / Local meeting</strong> in Settings so captions use the built-in dictionary. Optional laptop setting: <code>TRANSLATE_PROVIDER=mock</code>.",
  localNightTitle: "Meeting night offline checklist",
  localNight1: "Turn on the phone’s <strong>Mobile hotspot</strong>. Public internet is not required for that local Wi‑Fi.",
  localNight2: "Connect the laptop to that hotspot.",
  localNight3:
    "On the laptop, in this repo, run the three commands above (<code>npm install</code>, <code>npm run build</code>, <code>npm start</code> on port <strong>8080</strong>). Leave that window open.",
  localNight4:
    "Find the laptop’s LAN IP. On the host phone, guest phones, and the TV browser, open <code>http://LAPTOP-IP:8080</code>.",
  localNight5: "Create the room on the host phone. In <strong>Settings → Meeting mode</strong>, turn on <strong>Offline / Local meeting</strong> (built-in dictionary).",
  localNight6:
    "Guests join with the QR or the same laptop URL. <strong>Send to TV</strong> uses the TV browser on that URL.",
  localNight7:
    "Offline translate covers limited phrases. The mic may still need Chrome’s speech network — use <strong>Type a caption</strong> and <strong>Send</strong> if speech fails. Keep the laptop awake.",
  joinSetupLead: "Room <strong>{room}</strong>. Answer two questions, then join.",
  spokenQuestion: "What language are you speaking?",
  watchQuestion: "What language do you want to watch?",
  spokenWatchHint: "“I speak” is for your microphone and typed messages. “Show captions in” only changes this phone.",
  yourName: "Your name",
  optional: "Optional",
  join: "Join",
  leave: "Leave",
  roomWord: "Room",
  spokenLanguage: "I speak",
  spokenShort: "I speak",
  spokenLanguageNamed: "I speak: {name}",
  watch: "Show captions in",
  watchOnly: "only",
  watchAllName: "All three",
  watchEnOnly: "English only",
  watchEsOnly: "Español only",
  watchPtOnly: "Português only",
  watchAllLabel: "All three languages",
  watchAria: "Show captions in {label}",
  start: "Start",
  stop: "Stop",
  wait: "Wait",
  typeCaption: "Type a message",
  orTypeCaption: "Or type a message",
  waitSomeonePlaceholder: "Wait — someone else is speaking",
  send: "Send",
  sttHttps: "The microphone can't start on this link. You can still read captions and type a message.",
  sttNeedsChrome: "The live microphone doesn't work in this browser. You can still read captions and type a message.",
  sttPreferType: "If the microphone doesn't start, type a message instead. One person speaks at a time.",
  sttSameMeeting: "Same meeting as the host phone and the TV. One person speaks at a time.",
  onPhones: "{n} on phones",
  onPhonesSuffix: " · {n} on phones",
  joined: "Joined",
  tvConnected: "TV connected ({n})",
  tvConnectedSuffix: " · TV connected ({n})",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  wakingServer: "Waking up the caption server… this can take up to a minute.",
  pinTitle: "Enter the meeting PIN",
  pinHelp: "This phone will remember it.",
  pinClear: "Clear",
  pinBack: "Delete",
  pinChecking: "Checking…",
  pinWrong: "Wrong PIN. {n} tries left.",
  pinLocked: "Too many tries. Try again in {time}.",
  pinTryAgainNow: "You can try again now.",
  pinError: "Could not reach the server. Try again.",
  pinDigit: "Digit {n}",
  moreBtn: "More",
  moreAria: "More ways to send: write with your finger or use a photo",
  moreTitle: "More ways to caption",
  moreTools: "More tools",
  toolHome: "← Home",
  toolPhoto: "Photo translate",
  toolPhotoDesc: "Snap a sign or page and read it in English, Español and Português",
  toolWrite: "Write & translate",
  toolWriteDesc: "Write with your finger and see it in English, Español and Português",
  toolTalk: "Two-person conversation",
  toolTalkDesc: "One phone, two languages, hands-free",
  writeLang: "Writing language",
  talkLangA: "Person 1 speaks",
  talkLangB: "Person 2 speaks",
  talkStart: "Start conversation",
  talkStop: "Stop",
  talkHint: "Put the phone between you. The mic stays on and switches language after each pause. If it guesses wrong, tap 🎤 for who is speaking.",
  talkListening: "Listening for {lang}",
  talkEmpty: "Say something — the translation appears here.",
  talkNoSpeech: "This browser can't listen. Try Safari on iPhone or your phone's main browser on Android.",
  talkSameLang: "Pick two different languages.",
  talkClear: "Clear",
  talkExpand: "Show {lang} full screen",
  talkBack: "✕ Back to both",
  updateReady: "Updated · tap to refresh",
  bannerTitle: "Add Meeting Translator to your Home Screen",
  bannerIos1: "Tap Share {icon} in Safari's toolbar",
  bannerIos2: "Choose Add to Home Screen ➕",
  bannerIos3: "Tap Add — it opens full screen like an app",
  bannerAndroid: "Install it for full screen and one-tap launch.",
  bannerInstall: "Install",
  bannerDismiss: "Not now",
  bannerClose: "Dismiss",
  helpLink: "? Help",
  hapticsToggle: "Vibrate on tap",
  tourSkip: "Skip",
  tourNext: "Next",
  tourBack: "Back",
  tourDone: "Get started",
  tourAria: "How Meeting Translator works",
  tourStep: "Step {n} of {total}",
  tour1Title: "Live captions in your language",
  tour1Body: "Someone speaks and everyone reads it, translated into English, Español or Português — on their phone and on the TV.",
  tour2Title: "Create or join",
  tour2Body: "The host taps Create room and shares the room code or the QR. Guests scan the QR or tap Join a meeting and type the room code.",
  tour3Title: "Meeting PIN",
  tour3Body: "If your meeting has a PIN, enter the 4 digits once. This phone remembers it, so you will not be asked every time.",
  tour4Title: "TV and Send to TV",
  tour4Body: "Tap Send to TV to show big captions on a TV or laptop. No microphone? Type a message and tap Send — it reaches every phone and the TV.",
  swapAria: "Swap “I speak” and “Show captions in”",
  swapNeedsOne: "Pick one language under “Show captions in” (not all three) to swap.",
  writeBtn: "Write",
  writeTitle: "Write with your finger",
  writeHintNative: "Write a word or short phrase, then tap Recognize.",
  writeHintOcr: "Couldn't read that clearly. Print big, clear block letters and try again.",
  recognize: "Recognize",
  clearDrawing: "Clear",
  undoStroke: "Undo",
  useText: "Use text",
  recognizing: "Recognizing…",
  nothingRecognized: "Couldn't read that. Try again, larger.",
  drawFirst: "Draw something first.",
  photoBtn: "Photo",
  photoTitle: "Translate a photo",
  takePhoto: "Take photo",
  uploadPhoto: "Upload photo",
  photoTextLang: "Text in photo",
  photoAuto: "Detect for me",
  ocrLoading: "Loading the text reader (first time downloads a few MB)…",
  ocrReading: "Reading text… {pct}%",
  ocrNoText: "No text found. Try a sharper, closer photo.",
  ocrFailed: "Couldn't load the text reader. It needs internet the first time.",
  photoTextFound: "Text found (you can edit it)",
  retranslate: "Translate again",
  translatingEllipsis: "Translating…",
  postCaption: "Post as caption",
  translateWaking: "Translation is slow to respond — showing the original for now.",
  newCaptions: "New captions ↓",
  listeningDot: "Listening · {note}",
  floorYouType: "It's your turn — speak, or type a message.",
  floorYouSpeaking: "🔴 You're speaking — everyone sees your captions. Tap to stop when you're done.",
  floorYouHaveMic: "It's your turn. Type a message, or tap Stop to let someone else speak.",
  floorMicFreeType: "One person speaks at a time. Type a message to send it to everyone.",
  floorMicFreeStart: "One person speaks at a time. Tap to talk when you're ready.",
  youreSpeaking: "🔴 You're speaking — tap to stop when you're done",
  floorMicFreeGuests: "One person speaks at a time. Guests can take a turn from their phones.",
  listeningEllipsis: "Listening…",
  captionsWillAppear: "Captions will appear here and on the TV.",
  waitingForTv: "Waiting for TV",
  onThisPhone: "On this phone",
  reclaimMic: "Reclaim mic",
  micChromeHint: "Keep this app open on the screen while you speak.",
  watchLanguage: "Show captions in",
  clearWindows: "Clear windows",
  sendToTv: "Send to TV",
  sendToTvAria: "Send to TV — show QR and TV caption link",
  smartViewMode: "Smart View mode",
  smartViewAria: "Smart View mode — big captions to share this phone's screen on a TV",
  joinOnPhones: "Join on phones",
  joinPhonesAria: "Show join QR — guests scan it to join on their phones",
  close: "Close",
  copyTvLink: "Copy TV link",
  sendTvStep1: "On the TV, open its web browser and type the link above.",
  sendTvStep2: "Keep this phone on this screen during the meeting.",
  sendTvStep3: "Want one language per screen? Open “More TV options”.",
  openTvView: "Open TV view",
  openTvAria: "Open TV view on this device for testing",
  oneLanguagePerMonitor: "One language per screen",
  perMonitorHint: "Same room. Each screen shows only one language in big captions. Other TVs are not changed.",
  copyLangLink: "Copy {lang} link",
  open: "Open",
  scanToWatch: "Scan to watch and speak",
  copyJoinLink: "Copy join link",
  joinStep1: "Each person scans this QR with their phone camera.",
  joinStep2: "They pick the language they speak and the language for their captions, then tap Join.",
  joinStep3: "One person speaks at a time. Anyone can also type a message.",
  smartViewTip: "Now share this phone's screen to the TV (Smart View or screen sharing).",
  exitSmartView: "Exit Smart View mode",
  listeningSmart: "Listening · Smart View mode",
  smartViewStatus: "Smart View mode",
  couldNotReclaim: "Could not reclaim the mic.",
  joinLinkCopied: "Join link copied.",
  tvLinkCopied: "TV link copied.",
  tvLangLinkCopied: "{lang} TV link copied.",
  qrTv: "QR code for the TV caption page",
  qrLang: "QR code for {name} TV captions",
  qrJoin: "QR code so guests can join this meeting on their phones",
  nameSpeaking: "{name} speaking",
  phonesConnected: "Phones connected ({n})",
  phoneConnected: "Phone connected",
  waitingForPhone: "Waiting for phone",
  liveDot: "Live · {note}",
  waitingSpeech: "Waiting for live speech…",
  hostName: "Host",
  guestName: "Guest",
  someoneElse: "Someone else is speaking",
  someoneElseNamed: "Someone else is speaking · {name}",
  iphoneType: "The iPhone couldn't hear you. Type a message — Send still reaches every phone and the TV.",
  iphoneNoSpeech: "The iPhone didn't hear anything. Type a message — Send still reaches every phone and the TV.",
  safariRejected: "This phone couldn't listen in {locale} ({code}). Type a message — Send still reaches every phone and the TV.",
  noWebSpeech: "This browser can't listen. Type a message instead.",
  couldNotStartMic: "Could not start the microphone.",
  micStopped: "The microphone stopped. Type a message instead.",
  micBlocked: "Microphone blocked. Allow the microphone for this site, or type a message.",
  watchAllScope: "English · Español · Português",
  pinAskHost: "Ask the meeting host for the 4-digit code.",
  writeHere: "Write here",
  photoReadsIn: "Text in the photo: {lang}. You'll see it in English, Español and Português.",
  photoReadsAuto: "The language is detected for you. You'll see it in English, Español and Português.",
  micTapToTalk: "🎤 Tap to talk",
  micTapToStop: "■ Tap to stop",
  micWaitTurn: "✋ Please wait",
  showJoinQr: "Show join QR",
  settings: "⚙️ Settings",
  settingsTitle: "Settings",
  helpBtn: "? Help",
  helpAria: "How this app works",
  endMeeting: "End meeting",
  endMeetingQ: "End meeting?",
  endMeetingBody: "This phone stops captioning and goes back to the start screen.",
  leaveMeetingQ: "Leave meeting?",
  leaveMeetingBody: "You can join again with the room code.",
  stayInMeeting: "Stay",
  joinMeeting: "Join a meeting",
  joinMeetingHint: "Type the room code the host shows you.",
  openOnTv: "Open on the TV",
  openOnTvHint: "Shares the TV link so you can open it on the TV.",
  moreTvOptions: "More TV options",
  advanced: "Advanced",
  advancedSetupBtn: "Run without internet (laptop setup)",
  typeInstead: "⌨️ Type instead",
  changePrefs: "Change",
  changePrefsAria: "Change your name and languages",
  prefsSummary: "{name} · I speak {spoken}",
  leaveSetup: "✕ Leave",
  captionsOnTv: "Captions on TV",
  tvLangPick: "Caption language on this TV",
} as const;

export type MessageKey = keyof typeof en;

type Catalog = { [K in MessageKey]: string };

const es: Catalog = {
  uiLangLabel: "Idioma de la app",
  uiLangGroup: "Idioma de la app",
  uiLangHint: "Cambia los textos solo en este teléfono. “Yo hablo” sigue eligiendo el idioma del micrófono.",
  uiLangTagline:
    "Rompe las barreras del idioma en tus grupos pequeños. No necesitas equipo - funciona en cualquier dispositivo.",
  homeLede:
    "Subtítulos en vivo para la reunión, en varios idiomas. Un teléfono captura a quien habla; cada teléfono y el TV muestran ventanas en inglés, español y portugués.",
  createRoom: "Crear sala",
  haveRoomCode: "¿Tienes un código de sala?",
  roomCode: "Código de la sala",
  openTvWindows: "Mostrar subtítulos en esta pantalla (TV)",
  joinThisPhone: "Entrar",
  homeHint: "El anfitrión crea una sala en un teléfono. Los invitados escanean el código QR con la cámara del teléfono — no hace falta tienda de apps. <strong>Enviar al TV</strong> muestra subtítulos grandes en el TV.",
  meetingMode: "Modo de reunión",
  offlineLocal: "Sin conexión / reunión local",
  offlineAria: "Sin conexión / reunión local — usa el diccionario integrado, funciona sin internet",
  offlineBannerBefore: "La traducción sin conexión conoce un número limitado de frases. Más ayuda: ",
  laptopSteps: "Configuración avanzada",
  offlineBannerAfter: ".",
  offlineHint: "Activado: usa el diccionario integrado (menos frases, sin internet). Desactivado: usa el traductor en línea.",
  offlineLimited: "Traducción sin conexión (frases limitadas).",
  installTitle: "Instalar en este teléfono",
  installApp: "Instalar app",
  installStandaloneCopy:
    "Esta es la app Meeting Translator instalada. Crea una sala aquí y luego abre el enlace del TV en el televisor de la reunión.",
  installStandalone1: "Toca <strong>Crear sala</strong>.",
  installStandalone2: "Usa <strong>Enviar al TV</strong> para mostrar subtítulos grandes en el TV.",
  installStandalone3: "Deja esta app abierta en la pantalla mientras hablas.",
  installDoneCopy: "Instalada. Abre Meeting Translator desde la pantalla de inicio.",
  installDone1: "Busca el icono de <strong>Meeting Translator</strong> en la pantalla de inicio.",
  installDone2: "Ábrela — ocupa toda la pantalla como cualquier otra app.",
  installDone3: "Crea una sala y luego abre el enlace del TV en el televisor.",
  installGuideCopy: "Agrega Meeting Translator a la pantalla de inicio como una app normal. Así la reunión queda a un toque.",
  installReady1: "Toca <strong>Instalar app</strong> arriba y confirma.",
  installReady2: "Abre <strong>Meeting Translator</strong> desde la pantalla de inicio.",
  installReady3: "Crea la sala en el teléfono y luego abre el enlace del TV en el televisor.",
  installManual1: "En iPhone, usa Safari. En Android, usa el navegador principal del teléfono.",
  installManual2:
    "Toca el menú del navegador → <strong>Instalar app</strong> o <strong>Agregar a pantalla de inicio</strong>.",
  installManual3: "Abre <strong>Meeting Translator</strong> desde la pantalla de inicio y crea una sala.",
  localTitle: "Avanzado: usar sin internet",
  localIntro:
    "¿Sin internet público? Ejecuta la app en una laptop. Los teléfonos y el TV abren esa laptop en el mismo Wi‑Fi o en el hotspot del teléfono.",
  copyCommands: "Copiar comandos",
  copied: "Copiado",
  localStep1:
    "En la laptop, en este repositorio, pega esos tres comandos. <code>npm start</code> escucha en el puerto <strong>8080</strong> (<code>HOST=0.0.0.0</code>).",
  localStep2:
    "Busca la IP local de la laptop (macOS: System Settings → Wi‑Fi → Details; Windows: <code>ipconfig</code>; Linux: <code>ip addr</code>).",
  localStep3:
    "En cada teléfono y en el TV, abre <code>http://LAPTOP-LAN-IP:PORT</code> — por lo general <code>http://192.168.x.x:8080</code> — mientras compartan ese Wi‑Fi o hotspot.",
  localHereBefore: "Este dispositivo ya está en ",
  localHereAfter: " — usa esa URL en los teléfonos y el TV si comparten esta red.",
  localMicHint:
    "Usa <strong>Chrome</strong> para el micrófono. El reconocimiento de voz puede seguir necesitando una ruta de red al servicio de voz del aparato (Chrome / Google), según el teléfono. Eso no es del todo sin conexión. <strong>Escribe un subtítulo</strong> y Enviar si el micrófono no llega a un reconocedor.",
  localOfflineHint: "Activa <strong>Sin conexión / reunión local</strong> en Ajustes para que los subtítulos usen el diccionario integrado. Ajuste opcional en la laptop: <code>TRANSLATE_PROVIDER=mock</code>.",
  localNightTitle: "Lista de la noche de reunión sin conexión",
  localNight1: "Activa el <strong>hotspot móvil</strong> del teléfono. Ese Wi‑Fi local no necesita internet público.",
  localNight2: "Conecta la laptop a ese hotspot.",
  localNight3:
    "En la laptop, en este repositorio, ejecuta los tres comandos de arriba (<code>npm install</code>, <code>npm run build</code>, <code>npm start</code> en el puerto <strong>8080</strong>). Deja esa ventana abierta.",
  localNight4:
    "Busca la IP de la laptop en la red local. En el teléfono del anfitrión, los teléfonos de invitados y el navegador del TV, abre <code>http://LAPTOP-IP:8080</code>.",
  localNight5: "Crea la sala en el teléfono del anfitrión. En <strong>Ajustes → Modo de reunión</strong>, activa <strong>Sin conexión / reunión local</strong> (diccionario integrado).",
  localNight6:
    "Los invitados entran con el QR o la misma URL de la laptop. <strong>Enviar al TV</strong> usa el navegador del TV en esa URL.",
  localNight7:
    "La traducción sin conexión cubre frases limitadas. El micrófono puede seguir necesitando la red de voz de Chrome — usa <strong>Escribe un subtítulo</strong> y <strong>Enviar</strong> si la voz falla. Deja la laptop despierta.",
  joinSetupLead: "Sala <strong>{room}</strong>. Responde dos preguntas y entra.",
  spokenQuestion: "¿En qué idioma vas a hablar?",
  watchQuestion: "¿Qué idioma quieres ver?",
  spokenWatchHint: "“Yo hablo” es para tu micrófono y los mensajes que escribes. “Mostrar subtítulos en” solo cambia este teléfono.",
  yourName: "Tu nombre",
  optional: "Opcional",
  join: "Entrar",
  leave: "Salir",
  roomWord: "Sala",
  spokenLanguage: "Yo hablo",
  spokenShort: "Yo hablo",
  spokenLanguageNamed: "Yo hablo: {name}",
  watch: "Mostrar subtítulos en",
  watchOnly: "solo",
  watchAllName: "Los tres",
  watchEnOnly: "Solo inglés",
  watchEsOnly: "Solo español",
  watchPtOnly: "Solo portugués",
  watchAllLabel: "Los tres idiomas",
  watchAria: "Mostrar subtítulos en {label}",
  start: "Iniciar",
  stop: "Detener",
  wait: "Espera",
  typeCaption: "Escribe un mensaje",
  orTypeCaption: "O escribe un mensaje",
  waitSomeonePlaceholder: "Espera — otra persona está hablando",
  send: "Enviar",
  sttHttps: "El micrófono no puede arrancar con este enlace. Igual puedes leer los subtítulos y escribir un mensaje.",
  sttNeedsChrome: "El micrófono en vivo no funciona en este navegador. Igual puedes leer los subtítulos y escribir un mensaje.",
  sttPreferType: "Si el micrófono no arranca, escribe un mensaje. Habla una persona a la vez.",
  sttSameMeeting: "La misma reunión que el teléfono anfitrión y el TV. Habla una persona a la vez.",
  onPhones: "{n} en teléfonos",
  onPhonesSuffix: " · {n} en teléfonos",
  joined: "Conectado",
  tvConnected: "TV conectado ({n})",
  tvConnectedSuffix: " · TV conectado ({n})",
  connecting: "Conectando…",
  reconnecting: "Reconectando…",
  wakingServer: "Despertando el servidor de subtítulos… puede tardar hasta un minuto.",
  pinTitle: "Ingresa el PIN de la reunión",
  pinHelp: "Este teléfono lo recordará.",
  pinClear: "Borrar",
  pinBack: "Eliminar",
  pinChecking: "Verificando…",
  pinWrong: "PIN incorrecto. Quedan {n} intentos.",
  pinLocked: "Demasiados intentos. Intenta de nuevo en {time}.",
  pinTryAgainNow: "Ya puedes intentar de nuevo.",
  pinError: "No se pudo conectar con el servidor. Intenta de nuevo.",
  pinDigit: "Dígito {n}",
  moreBtn: "Más",
  moreAria: "Más formas de enviar: escribir con el dedo o usar una foto",
  moreTitle: "Más formas de subtitular",
  moreTools: "Más herramientas",
  toolHome: "← Inicio",
  toolPhoto: "Traducir foto",
  toolPhotoDesc: "Fotografía un letrero o página y léelo en English, Español y Português",
  toolWrite: "Escribir y traducir",
  toolWriteDesc: "Escribe con el dedo y míralo en English, Español y Português",
  toolTalk: "Conversación entre dos",
  toolTalkDesc: "Un teléfono, dos idiomas, manos libres",
  writeLang: "Idioma de escritura",
  talkLangA: "La persona 1 habla",
  talkLangB: "La persona 2 habla",
  talkStart: "Iniciar conversación",
  talkStop: "Detener",
  talkHint: "Pon el teléfono entre ustedes. El micrófono sigue encendido y cambia de idioma después de cada pausa. Si se equivoca, toca 🎤 de quien habla.",
  talkListening: "Escuchando {lang}",
  talkEmpty: "Di algo: la traducción aparece aquí.",
  talkNoSpeech: "Este navegador no puede escuchar. Prueba Safari en iPhone o el navegador principal en Android.",
  talkSameLang: "Elige dos idiomas distintos.",
  talkClear: "Borrar",
  talkExpand: "Ver {lang} en pantalla completa",
  talkBack: "✕ Volver a ambos",
  updateReady: "Actualizado · toca para recargar",
  bannerTitle: "Agrega Meeting Translator a tu pantalla de inicio",
  bannerIos1: "Toca Compartir {icon} en la barra de Safari",
  bannerIos2: "Elige Agregar a pantalla de inicio ➕",
  bannerIos3: "Toca Agregar — se abre a pantalla completa como una app",
  bannerAndroid: "Instálala para pantalla completa y abrirla con un toque.",
  bannerInstall: "Instalar",
  bannerDismiss: "Ahora no",
  bannerClose: "Descartar",
  helpLink: "? Ayuda",
  hapticsToggle: "Vibrar al tocar",
  tourSkip: "Omitir",
  tourNext: "Siguiente",
  tourBack: "Atrás",
  tourDone: "Comenzar",
  tourAria: "Cómo funciona Meeting Translator",
  tourStep: "Paso {n} de {total}",
  tour1Title: "Subtítulos en vivo en tu idioma",
  tour1Body: "Alguien habla y todos lo leen traducido al English, Español o Português — en su teléfono y en la TV.",
  tour2Title: "Crear o unirse",
  tour2Body: "El anfitrión toca Crear sala y comparte el código de sala o el QR. Los invitados escanean el QR o tocan Unirse a una reunión y escriben el código de sala.",
  tour3Title: "PIN de la reunión",
  tour3Body: "Si tu reunión tiene PIN, escribe los 4 dígitos una vez. Este teléfono lo recuerda y no te lo pedirá cada vez.",
  tour4Title: "TV y Enviar a la TV",
  tour4Body: "Toca Enviar al TV para ver subtítulos grandes en un TV o portátil. ¿Sin micrófono? Escribe un mensaje y toca Enviar — llega a todos los teléfonos y al TV.",
  swapAria: "Intercambiar “Yo hablo” y “Mostrar subtítulos en”",
  swapNeedsOne: "Elige un solo idioma en “Mostrar subtítulos en” (no los tres) para intercambiar.",
  writeBtn: "Escribir",
  writeTitle: "Escribe con el dedo",
  writeHintNative: "Escribe una palabra o frase corta y toca Reconocer.",
  writeHintOcr: "No se pudo leer bien. Escribe letras de molde grandes y claras e inténtalo de nuevo.",
  recognize: "Reconocer",
  clearDrawing: "Borrar",
  undoStroke: "Deshacer",
  useText: "Usar texto",
  recognizing: "Reconociendo…",
  nothingRecognized: "No se pudo leer. Inténtalo más grande.",
  drawFirst: "Primero dibuja algo.",
  photoBtn: "Foto",
  photoTitle: "Traducir una foto",
  takePhoto: "Tomar foto",
  uploadPhoto: "Subir foto",
  photoTextLang: "Texto en la foto",
  photoAuto: "Detectar solo",
  ocrLoading: "Cargando el lector de texto (la primera vez descarga unos MB)…",
  ocrReading: "Leyendo texto… {pct}%",
  ocrNoText: "No se encontró texto. Prueba una foto más nítida y cercana.",
  ocrFailed: "No se pudo cargar el lector de texto. Necesita internet la primera vez.",
  photoTextFound: "Texto encontrado (puedes editarlo)",
  retranslate: "Traducir de nuevo",
  translatingEllipsis: "Traduciendo…",
  postCaption: "Publicar como subtítulo",
  translateWaking: "La traducción tarda en responder; por ahora se muestra el original.",
  newCaptions: "Subtítulos nuevos ↓",
  listeningDot: "Escuchando · {note}",
  floorYouType: "Es tu turno — habla o escribe un mensaje.",
  floorYouSpeaking: "🔴 Estás hablando — todos ven tus subtítulos. Toca para parar cuando termines.",
  floorYouHaveMic: "Es tu turno. Escribe un mensaje o toca Parar para que otra persona hable.",
  floorMicFreeType: "Habla una persona a la vez. Escribe un mensaje para enviarlo a todos.",
  floorMicFreeStart: "Habla una persona a la vez. Toca para hablar cuando estés listo.",
  youreSpeaking: "🔴 Estás hablando — toca para parar cuando termines",
  floorMicFreeGuests: "Habla una persona a la vez. Los invitados pueden tomar un turno desde sus teléfonos.",
  listeningEllipsis: "Escuchando…",
  captionsWillAppear: "Los subtítulos aparecerán aquí y en el TV.",
  waitingForTv: "Esperando el TV",
  onThisPhone: "En este teléfono",
  reclaimMic: "Recuperar micrófono",
  micChromeHint: "Deja esta app abierta en la pantalla mientras hablas.",
  watchLanguage: "Mostrar subtítulos en",
  clearWindows: "Borrar ventanas",
  sendToTv: "Enviar al TV",
  sendToTvAria: "Enviar al TV — mostrar el QR y el enlace de subtítulos del TV",
  smartViewMode: "Modo Smart View",
  smartViewAria: "Modo Smart View — subtítulos grandes para compartir la pantalla de este teléfono en un TV",
  joinOnPhones: "Unirse en los teléfonos",
  joinPhonesAria: "Mostrar QR para unirse — los invitados lo escanean para entrar desde sus teléfonos",
  close: "Cerrar",
  copyTvLink: "Copiar enlace del TV",
  sendTvStep1: "En el TV, abre su navegador web y escribe el enlace de arriba.",
  sendTvStep2: "Deja este teléfono en esta pantalla durante la reunión.",
  sendTvStep3: "¿Quieres un idioma por pantalla? Abre “Más opciones de TV”.",
  openTvView: "Abrir vista de TV",
  openTvAria: "Abrir la vista de TV en este dispositivo para probar",
  oneLanguagePerMonitor: "Un idioma por pantalla",
  perMonitorHint: "La misma sala. Cada pantalla muestra solo un idioma con subtítulos grandes. Los otros TV no cambian.",
  copyLangLink: "Copiar enlace {lang}",
  open: "Abrir",
  scanToWatch: "Escanea para ver y hablar",
  copyJoinLink: "Copiar enlace para entrar",
  joinStep1: "Cada persona escanea este QR con la cámara de su teléfono.",
  joinStep2: "Eligen el idioma en que hablan y el idioma de sus subtítulos, y tocan Entrar.",
  joinStep3: "Habla una persona a la vez. Cualquiera puede también escribir un mensaje.",
  smartViewTip: "Ahora comparte la pantalla de este teléfono en el TV (Smart View o compartir pantalla).",
  exitSmartView: "Salir del modo Smart View",
  listeningSmart: "Escuchando · Modo Smart View",
  smartViewStatus: "Modo Smart View",
  couldNotReclaim: "No se pudo recuperar el micrófono.",
  joinLinkCopied: "Enlace para entrar copiado.",
  tvLinkCopied: "Enlace del TV copiado.",
  tvLangLinkCopied: "Enlace de TV {lang} copiado.",
  qrTv: "Código QR de la página de subtítulos del TV",
  qrLang: "Código QR de los subtítulos de TV en {name}",
  qrJoin: "Código QR para que los invitados entren a esta reunión en sus teléfonos",
  nameSpeaking: "{name} está hablando",
  phonesConnected: "Teléfonos conectados ({n})",
  phoneConnected: "Teléfono conectado",
  waitingForPhone: "Esperando el teléfono",
  liveDot: "En vivo · {note}",
  waitingSpeech: "Esperando la voz en vivo…",
  hostName: "Anfitrión",
  guestName: "Invitado",
  someoneElse: "Otra persona está hablando",
  someoneElseNamed: "Otra persona está hablando · {name}",
  iphoneType: "El iPhone no pudo oírte. Escribe un mensaje — Enviar igual llega a cada teléfono y al TV.",
  iphoneNoSpeech: "El iPhone no oyó nada. Escribe un mensaje — Enviar igual llega a cada teléfono y al TV.",
  safariRejected: "Este teléfono no pudo escuchar en {locale} ({code}). Escribe un mensaje — Enviar igual llega a cada teléfono y al TV.",
  noWebSpeech: "Este navegador no puede escuchar. Escribe un mensaje.",
  couldNotStartMic: "No se pudo iniciar el micrófono.",
  micStopped: "El micrófono se detuvo. Escribe un mensaje.",
  micBlocked: "Micrófono bloqueado. Permite el micrófono en este sitio, o escribe un mensaje.",
  watchAllScope: "English · Español · Português",
  pinAskHost: "Pídele el código de 4 dígitos al anfitrión de la reunión.",
  writeHere: "Escribe aquí",
  photoReadsIn: "Texto en la foto: {lang}. Lo verás en English, Español y Português.",
  photoReadsAuto: "El idioma se detecta solo. Lo verás en English, Español y Português.",
  micTapToTalk: "🎤 Toca para hablar",
  micTapToStop: "■ Toca para parar",
  micWaitTurn: "✋ Espera, por favor",
  showJoinQr: "Mostrar QR para unirse",
  settings: "⚙️ Ajustes",
  settingsTitle: "Ajustes",
  helpBtn: "? Ayuda",
  helpAria: "Cómo funciona esta app",
  endMeeting: "Terminar reunión",
  endMeetingQ: "¿Terminar la reunión?",
  endMeetingBody: "Este teléfono deja de subtitular y vuelve a la pantalla de inicio.",
  leaveMeetingQ: "¿Salir de la reunión?",
  leaveMeetingBody: "Puedes volver a entrar con el código de sala.",
  stayInMeeting: "Quedarme",
  joinMeeting: "Unirse a una reunión",
  joinMeetingHint: "Escribe el código de sala que te muestra el anfitrión.",
  openOnTv: "Abrir en el TV",
  openOnTvHint: "Comparte el enlace del TV para abrirlo en el TV.",
  moreTvOptions: "Más opciones de TV",
  advanced: "Avanzado",
  advancedSetupBtn: "Usar sin internet (configuración en laptop)",
  typeInstead: "⌨️ Escribir en su lugar",
  changePrefs: "Cambiar",
  changePrefsAria: "Cambiar tu nombre e idiomas",
  prefsSummary: "{name} · Yo hablo {spoken}",
  leaveSetup: "✕ Salir",
  captionsOnTv: "Subtítulos en el TV",
  tvLangPick: "Idioma de los subtítulos en este TV",
};

const pt: Catalog = {
  uiLangLabel: "Idioma do app",
  uiLangGroup: "Idioma do app",
  uiLangHint: "Muda os textos só neste telefone. “Eu falo” continua escolhendo o idioma do microfone.",
  uiLangTagline:
    "Quebre as barreiras do idioma nos seus grupos pequenos. Não precisa de equipamento - funciona em qualquer aparelho.",
  homeLede:
    "Legendas ao vivo para a reunião, em vários idiomas. Um telefone captura quem fala; cada telefone e a TV mostram janelas em inglês, espanhol e português.",
  createRoom: "Criar sala",
  haveRoomCode: "Tem um código da sala?",
  roomCode: "Código da sala",
  openTvWindows: "Mostrar legendas nesta tela (TV)",
  joinThisPhone: "Entrar",
  homeHint: "O anfitrião cria uma sala num telefone. Os convidados escaneiam o código QR com a câmera do telefone — sem loja de apps. <strong>Enviar para a TV</strong> mostra legendas grandes na TV.",
  meetingMode: "Modo da reunião",
  offlineLocal: "Sem internet / reunião local",
  offlineAria: "Sem internet / reunião local — usa o dicionário interno, funciona sem internet",
  offlineBannerBefore: "A tradução offline conhece um número limitado de frases. Mais ajuda: ",
  laptopSteps: "Configuração avançada",
  offlineBannerAfter: ".",
  offlineHint: "Ligado: usa o dicionário interno (menos frases, sem internet). Desligado: usa o tradutor online.",
  offlineLimited: "Tradução offline (frases limitadas).",
  installTitle: "Instalar neste telefone",
  installApp: "Instalar app",
  installStandaloneCopy:
    "Este é o app Meeting Translator instalado. Crie uma sala aqui e depois abra o link da TV na televisão da reunião.",
  installStandalone1: "Toque em <strong>Criar sala</strong>.",
  installStandalone2: "Use <strong>Enviar para a TV</strong> para mostrar legendas grandes na TV.",
  installStandalone3: "Deixe este app aberto na tela enquanto você fala.",
  installDoneCopy: "Instalado. Abra o Meeting Translator pela tela inicial.",
  installDone1: "Encontre o ícone do <strong>Meeting Translator</strong> na tela inicial.",
  installDone2: "Abra — ocupa a tela toda como qualquer outro app.",
  installDone3: "Crie uma sala e depois abra o link da TV na televisão.",
  installGuideCopy: "Adicione o Meeting Translator à tela inicial como um app normal. Assim a reunião fica a um toque.",
  installReady1: "Toque em <strong>Instalar app</strong> acima e confirme.",
  installReady2: "Abra o <strong>Meeting Translator</strong> pela tela inicial.",
  installReady3: "Crie a sala no telefone e depois abra o link da TV na televisão.",
  installManual1: "No iPhone, use o Safari. No Android, use o navegador principal do telefone.",
  installManual2:
    "Toque no menu do navegador → <strong>Instalar app</strong> ou <strong>Adicionar à Tela de Início</strong>.",
  installManual3: "Abra o <strong>Meeting Translator</strong> pela tela inicial e crie uma sala.",
  localTitle: "Avançado: usar sem internet",
  localIntro:
    "Sem internet pública? Rode o app num laptop. Os telefones e a TV abrem esse laptop no mesmo Wi‑Fi ou no hotspot do telefone.",
  copyCommands: "Copiar comandos",
  copied: "Copiado",
  localStep1:
    "No laptop, neste repositório, cole esses três comandos. <code>npm start</code> escuta na porta <strong>8080</strong> (<code>HOST=0.0.0.0</code>).",
  localStep2:
    "Ache o IP local do laptop (macOS: System Settings → Wi‑Fi → Details; Windows: <code>ipconfig</code>; Linux: <code>ip addr</code>).",
  localStep3:
    "Em cada telefone e na TV, abra <code>http://LAPTOP-LAN-IP:PORT</code> — em geral <code>http://192.168.x.x:8080</code> — enquanto eles compartilham esse Wi‑Fi ou hotspot.",
  localHereBefore: "Este aparelho já está em ",
  localHereAfter: " — use essa URL nos telefones e na TV se eles compartilham esta rede.",
  localMicHint:
    "Use o <strong>Chrome</strong> para o microfone. O reconhecimento de voz ainda pode precisar de um caminho de rede até o serviço de voz do aparelho (Chrome / Google), conforme o telefone. Isso não é totalmente offline. <strong>Digite uma legenda</strong> e Enviar se o microfone não alcançar um reconhecedor.",
  localOfflineHint: "Ative <strong>Sem internet / reunião local</strong> em Configurações para as legendas usarem o dicionário interno. Ajuste opcional no laptop: <code>TRANSLATE_PROVIDER=mock</code>.",
  localNightTitle: "Lista da noite de reunião offline",
  localNight1: "Ligue o <strong>hotspot móvel</strong> do telefone. Esse Wi‑Fi local não precisa de internet pública.",
  localNight2: "Conecte o laptop a esse hotspot.",
  localNight3:
    "No laptop, neste repositório, rode os três comandos acima (<code>npm install</code>, <code>npm run build</code>, <code>npm start</code> na porta <strong>8080</strong>). Deixe essa janela aberta.",
  localNight4:
    "Ache o IP do laptop na rede local. No telefone do anfitrião, nos telefones dos convidados e no navegador da TV, abra <code>http://LAPTOP-IP:8080</code>.",
  localNight5: "Crie a sala no telefone do anfitrião. Em <strong>Configurações → Modo da reunião</strong>, ligue <strong>Sem internet / reunião local</strong> (dicionário interno).",
  localNight6:
    "Os convidados entram pelo QR ou pela mesma URL do laptop. <strong>Enviar para a TV</strong> usa o navegador da TV nessa URL.",
  localNight7:
    "A tradução offline cobre frases limitadas. O microfone ainda pode precisar da rede de voz do Chrome — use <strong>Digite uma legenda</strong> e <strong>Enviar</strong> se a voz falhar. Deixe o laptop acordado.",
  joinSetupLead: "Sala <strong>{room}</strong>. Responda duas perguntas e entre.",
  spokenQuestion: "Em que idioma você vai falar?",
  watchQuestion: "Que idioma você quer ver?",
  spokenWatchHint: "“Eu falo” é para o seu microfone e as mensagens digitadas. “Mostrar legendas em” só muda este telefone.",
  yourName: "Seu nome",
  optional: "Opcional",
  join: "Entrar",
  leave: "Sair",
  roomWord: "Sala",
  spokenLanguage: "Eu falo",
  spokenShort: "Eu falo",
  spokenLanguageNamed: "Eu falo: {name}",
  watch: "Mostrar legendas em",
  watchOnly: "só",
  watchAllName: "Os três",
  watchEnOnly: "Só inglês",
  watchEsOnly: "Só espanhol",
  watchPtOnly: "Só português",
  watchAllLabel: "Os três idiomas",
  watchAria: "Mostrar legendas em {label}",
  start: "Iniciar",
  stop: "Parar",
  wait: "Aguarde",
  typeCaption: "Digite uma mensagem",
  orTypeCaption: "Ou digite uma mensagem",
  waitSomeonePlaceholder: "Aguarde — outra pessoa está falando",
  send: "Enviar",
  sttHttps: "O microfone não consegue iniciar neste link. Você ainda pode ler as legendas e digitar uma mensagem.",
  sttNeedsChrome: "O microfone ao vivo não funciona neste navegador. Você ainda pode ler as legendas e digitar uma mensagem.",
  sttPreferType: "Se o microfone não iniciar, digite uma mensagem. Uma pessoa fala por vez.",
  sttSameMeeting: "A mesma reunião do telefone anfitrião e da TV. Uma pessoa fala por vez.",
  onPhones: "{n} nos telefones",
  onPhonesSuffix: " · {n} nos telefones",
  joined: "Conectado",
  tvConnected: "TV conectada ({n})",
  tvConnectedSuffix: " · TV conectada ({n})",
  connecting: "Conectando…",
  reconnecting: "Reconectando…",
  wakingServer: "Acordando o servidor de legendas… pode levar até um minuto.",
  pinTitle: "Digite o PIN da reunião",
  pinHelp: "Este telefone vai lembrar.",
  pinClear: "Limpar",
  pinBack: "Apagar",
  pinChecking: "Verificando…",
  pinWrong: "PIN incorreto. Restam {n} tentativas.",
  pinLocked: "Muitas tentativas. Tente de novo em {time}.",
  pinTryAgainNow: "Você já pode tentar de novo.",
  pinError: "Não foi possível falar com o servidor. Tente de novo.",
  pinDigit: "Dígito {n}",
  moreBtn: "Mais",
  moreAria: "Mais formas de enviar: escrever com o dedo ou usar uma foto",
  moreTitle: "Mais formas de legendar",
  moreTools: "Mais ferramentas",
  toolHome: "← Início",
  toolPhoto: "Traduzir foto",
  toolPhotoDesc: "Fotografe uma placa ou página e leia em English, Español e Português",
  toolWrite: "Escrever e traduzir",
  toolWriteDesc: "Escreva com o dedo e veja em English, Español e Português",
  toolTalk: "Conversa entre duas pessoas",
  toolTalkDesc: "Um telefone, dois idiomas, mãos livres",
  writeLang: "Idioma da escrita",
  talkLangA: "A pessoa 1 fala",
  talkLangB: "A pessoa 2 fala",
  talkStart: "Iniciar conversa",
  talkStop: "Parar",
  talkHint: "Coloque o telefone entre vocês. O microfone fica ligado e troca de idioma após cada pausa. Se errar, toque no 🎤 de quem fala.",
  talkListening: "Ouvindo {lang}",
  talkEmpty: "Diga algo — a tradução aparece aqui.",
  talkNoSpeech: "Este navegador não consegue ouvir. Tente o Safari no iPhone ou o navegador principal no Android.",
  talkSameLang: "Escolha dois idiomas diferentes.",
  talkClear: "Limpar",
  talkExpand: "Ver {lang} em tela cheia",
  talkBack: "✕ Voltar aos dois",
  updateReady: "Atualizado · toque para recarregar",
  bannerTitle: "Adicione o Meeting Translator à Tela de Início",
  bannerIos1: "Toque em Compartilhar {icon} na barra do Safari",
  bannerIos2: "Escolha Adicionar à Tela de Início ➕",
  bannerIos3: "Toque em Adicionar — abre em tela cheia como um app",
  bannerAndroid: "Instale para tela cheia e abrir com um toque.",
  bannerInstall: "Instalar",
  bannerDismiss: "Agora não",
  bannerClose: "Dispensar",
  helpLink: "? Ajuda",
  hapticsToggle: "Vibrar ao tocar",
  tourSkip: "Pular",
  tourNext: "Próximo",
  tourBack: "Voltar",
  tourDone: "Começar",
  tourAria: "Como o Meeting Translator funciona",
  tourStep: "Passo {n} de {total}",
  tour1Title: "Legendas ao vivo no seu idioma",
  tour1Body: "Alguém fala e todos leem traduzido para English, Español ou Português — no celular e na TV.",
  tour2Title: "Criar ou entrar",
  tour2Body: "O anfitrião toca em Criar sala e compartilha o código da sala ou o QR. Os convidados escaneiam o QR ou tocam em Entrar numa reunião e digitam o código da sala.",
  tour3Title: "PIN da reunião",
  tour3Body: "Se a reunião tiver PIN, digite os 4 dígitos uma vez. Este telefone lembra, então não será pedido toda vez.",
  tour4Title: "TV e Enviar para a TV",
  tour4Body: "Toque em Enviar para a TV para ver legendas grandes numa TV ou notebook. Sem microfone? Digite uma mensagem e toque em Enviar — chega a todos os telefones e à TV.",
  swapAria: "Trocar “Eu falo” e “Mostrar legendas em”",
  swapNeedsOne: "Escolha um só idioma em “Mostrar legendas em” (não os três) para trocar.",
  writeBtn: "Escrever",
  writeTitle: "Escreva com o dedo",
  writeHintNative: "Escreva uma palavra ou frase curta e toque em Reconhecer.",
  writeHintOcr: "Não deu para ler bem. Escreva letras de forma grandes e claras e tente de novo.",
  recognize: "Reconhecer",
  clearDrawing: "Limpar",
  undoStroke: "Desfazer",
  useText: "Usar texto",
  recognizing: "Reconhecendo…",
  nothingRecognized: "Não deu para ler. Tente maior.",
  drawFirst: "Desenhe algo primeiro.",
  photoBtn: "Foto",
  photoTitle: "Traduzir uma foto",
  takePhoto: "Tirar foto",
  uploadPhoto: "Enviar foto",
  photoTextLang: "Texto na foto",
  photoAuto: "Detectar sozinho",
  ocrLoading: "Carregando o leitor de texto (a primeira vez baixa alguns MB)…",
  ocrReading: "Lendo texto… {pct}%",
  ocrNoText: "Nenhum texto encontrado. Tente uma foto mais nítida e próxima.",
  ocrFailed: "Não foi possível carregar o leitor de texto. Precisa de internet na primeira vez.",
  photoTextFound: "Texto encontrado (pode editar)",
  retranslate: "Traduzir de novo",
  translatingEllipsis: "Traduzindo…",
  postCaption: "Publicar como legenda",
  translateWaking: "A tradução está demorando; mostrando o original por enquanto.",
  newCaptions: "Novas legendas ↓",
  listeningDot: "Ouvindo · {note}",
  floorYouType: "É a sua vez — fale ou digite uma mensagem.",
  floorYouSpeaking: "🔴 Você está falando — todos veem suas legendas. Toque para parar quando terminar.",
  floorYouHaveMic: "É a sua vez. Digite uma mensagem ou toque em Parar para outra pessoa falar.",
  floorMicFreeType: "Uma pessoa fala por vez. Digite uma mensagem para enviar a todos.",
  floorMicFreeStart: "Uma pessoa fala por vez. Toque para falar quando estiver pronto.",
  youreSpeaking: "🔴 Você está falando — toque para parar quando terminar",
  floorMicFreeGuests: "Uma pessoa fala por vez. Os convidados podem falar pelos telefones deles.",
  listeningEllipsis: "Ouvindo…",
  captionsWillAppear: "As legendas vão aparecer aqui e na TV.",
  waitingForTv: "Aguardando a TV",
  onThisPhone: "Neste telefone",
  reclaimMic: "Retomar microfone",
  micChromeHint: "Deixe este app aberto na tela enquanto você fala.",
  watchLanguage: "Mostrar legendas em",
  clearWindows: "Limpar janelas",
  sendToTv: "Enviar para a TV",
  sendToTvAria: "Enviar para a TV — mostrar o QR e o link das legendas da TV",
  smartViewMode: "Modo Smart View",
  smartViewAria: "Modo Smart View — legendas grandes para compartilhar a tela deste telefone numa TV",
  joinOnPhones: "Entrar nos telefones",
  joinPhonesAria: "Mostrar QR para entrar — os convidados escaneiam para entrar pelos telefones",
  close: "Fechar",
  copyTvLink: "Copiar link da TV",
  sendTvStep1: "Na TV, abra o navegador e digite o link acima.",
  sendTvStep2: "Deixe este telefone nesta tela durante a reunião.",
  sendTvStep3: "Quer um idioma por tela? Abra “Mais opções de TV”.",
  openTvView: "Abrir visão da TV",
  openTvAria: "Abrir a visão da TV neste aparelho para testar",
  oneLanguagePerMonitor: "Um idioma por tela",
  perMonitorHint: "A mesma sala. Cada tela mostra só um idioma com legendas grandes. As outras TVs não mudam.",
  copyLangLink: "Copiar link {lang}",
  open: "Abrir",
  scanToWatch: "Escaneie para ver e falar",
  copyJoinLink: "Copiar link para entrar",
  joinStep1: "Cada pessoa escaneia este QR com a câmera do telefone.",
  joinStep2: "Elas escolhem o idioma em que falam e o idioma das legendas, e tocam em Entrar.",
  joinStep3: "Uma pessoa fala por vez. Qualquer um também pode digitar uma mensagem.",
  smartViewTip: "Agora compartilhe a tela deste telefone na TV (Smart View ou compartilhar tela).",
  exitSmartView: "Sair do modo Smart View",
  listeningSmart: "Ouvindo · Modo Smart View",
  smartViewStatus: "Modo Smart View",
  couldNotReclaim: "Não foi possível retomar o microfone.",
  joinLinkCopied: "Link para entrar copiado.",
  tvLinkCopied: "Link da TV copiado.",
  tvLangLinkCopied: "Link de TV {lang} copiado.",
  qrTv: "Código QR da página de legendas da TV",
  qrLang: "Código QR das legendas de TV em {name}",
  qrJoin: "Código QR para os convidados entrarem nesta reunião nos telefones deles",
  nameSpeaking: "{name} está falando",
  phonesConnected: "Telefones conectados ({n})",
  phoneConnected: "Telefone conectado",
  waitingForPhone: "Aguardando o telefone",
  liveDot: "Ao vivo · {note}",
  waitingSpeech: "Aguardando a fala ao vivo…",
  hostName: "Anfitrião",
  guestName: "Convidado",
  someoneElse: "Outra pessoa está falando",
  someoneElseNamed: "Outra pessoa está falando · {name}",
  iphoneType: "O iPhone não conseguiu ouvir você. Digite uma mensagem — Enviar ainda chega a cada telefone e à TV.",
  iphoneNoSpeech: "O iPhone não ouviu nada. Digite uma mensagem — Enviar ainda chega a cada telefone e à TV.",
  safariRejected: "Este telefone não conseguiu ouvir em {locale} ({code}). Digite uma mensagem — Enviar ainda chega a cada telefone e à TV.",
  noWebSpeech: "Este navegador não consegue ouvir. Digite uma mensagem.",
  couldNotStartMic: "Não foi possível iniciar o microfone.",
  micStopped: "O microfone parou. Digite uma mensagem.",
  micBlocked: "Microfone bloqueado. Permita o microfone neste site, ou digite uma mensagem.",
  watchAllScope: "English · Español · Português",
  pinAskHost: "Peça o código de 4 dígitos ao anfitrião da reunião.",
  writeHere: "Escreva aqui",
  photoReadsIn: "Texto na foto: {lang}. Você vai ver em English, Español e Português.",
  photoReadsAuto: "O idioma é detectado sozinho. Você vai ver em English, Español e Português.",
  micTapToTalk: "🎤 Toque para falar",
  micTapToStop: "■ Toque para parar",
  micWaitTurn: "✋ Aguarde, por favor",
  showJoinQr: "Mostrar QR para entrar",
  settings: "⚙️ Configurações",
  settingsTitle: "Configurações",
  helpBtn: "? Ajuda",
  helpAria: "Como este app funciona",
  endMeeting: "Encerrar reunião",
  endMeetingQ: "Encerrar a reunião?",
  endMeetingBody: "Este telefone para de legendar e volta para a tela inicial.",
  leaveMeetingQ: "Sair da reunião?",
  leaveMeetingBody: "Você pode entrar de novo com o código da sala.",
  stayInMeeting: "Ficar",
  joinMeeting: "Entrar numa reunião",
  joinMeetingHint: "Digite o código da sala que o anfitrião mostrar.",
  openOnTv: "Abrir na TV",
  openOnTvHint: "Compartilha o link da TV para abrir na TV.",
  moreTvOptions: "Mais opções de TV",
  advanced: "Avançado",
  advancedSetupBtn: "Usar sem internet (configuração no laptop)",
  typeInstead: "⌨️ Digitar em vez disso",
  changePrefs: "Mudar",
  changePrefsAria: "Mudar seu nome e idiomas",
  prefsSummary: "{name} · Eu falo {spoken}",
  leaveSetup: "✕ Sair",
  captionsOnTv: "Legendas na TV",
  tvLangPick: "Idioma das legendas nesta TV",
};

const catalogs: Record<UiLang, Catalog> = { en, es, pt };

const listeners = new Set<(lang: UiLang) => void>();

function isUiLang(value: unknown): value is UiLang {
  return value === "en" || value === "es" || value === "pt";
}

export function uiLangFromTags(tags: readonly string[] | undefined): UiLang {
  for (const tag of tags ?? []) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (isUiLang(base)) return base;
  }
  return "en";
}

function readStoredUiLang(): UiLang | null {
  try {
    const value = localStorage.getItem(UI_LANG_STORAGE_KEY);
    return isUiLang(value) ? value : null;
  } catch {
    return null;
  }
}

function browserUiLang(): UiLang {
  const nav = globalThis.navigator;
  if (!nav) return "en";
  const tags = nav.languages?.length ? [...nav.languages] : nav.language ? [nav.language] : [];
  return uiLangFromTags(tags);
}

let current: UiLang = readStoredUiLang() ?? browserUiLang();

export function getUiLang(): UiLang {
  return current;
}

/** persist=false changes the labels for this page only (a one-language TV link). */
export function setUiLang(lang: UiLang, persist = true): void {
  if (persist) {
    try {
      localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
    } catch {
      /* private mode / blocked storage */
    }
  }
  if (lang === current) return;
  current = lang;
  for (const listener of [...listeners]) listener(lang);
}

export function subscribeUiLang(listener: (lang: UiLang) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = catalogs[current][key] ?? catalogs.en[key];
  return fill(raw, vars);
}

function translateDomKey(key: string): string {
  if (Object.prototype.hasOwnProperty.call(en, key)) return t(key as MessageKey);
  return key;
}

/** Rewrite `data-i18n*` nodes already in the document. Does not rebuild the screen. */
export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-i18n], [data-i18n-html], [data-i18n-placeholder], [data-i18n-aria], [data-set-ui-lang]").forEach((el) => {
    if (el.dataset.i18n) el.textContent = translateDomKey(el.dataset.i18n);
    if (el.dataset.i18nHtml) el.innerHTML = translateDomKey(el.dataset.i18nHtml);
    if (el.dataset.i18nPlaceholder && "placeholder" in el) {
      (el as HTMLInputElement).placeholder = translateDomKey(el.dataset.i18nPlaceholder);
    }
    if (el.dataset.i18nAria) el.setAttribute("aria-label", translateDomKey(el.dataset.i18nAria));
    const chosen = el.dataset.setUiLang;
    if (isUiLang(chosen)) {
      const on = chosen === current;
      el.classList.toggle("active", on);
      el.setAttribute("aria-pressed", String(on));
    }
  });
}

/**
 * full — tagline, label, chips, and the Spoken hint (host controls).
 * home — tagline above the label and chips. No hint yet; Spoken is not on this screen.
 * entry — label and chips only, for the post-QR join setup.
 * compact — chips only, beside in-room caption panes. Full language names.
 * tv — TV bar only. Visible labels are the codes EN, ES, and PT on one row.
 */
export function uiLangSwitcherHtml(compact: boolean | "home" | "entry" | "tv" = false): string {
  const mode =
    compact === true ? "compact" : compact === "home" || compact === "entry" || compact === "tv" ? compact : "full";
  const tagline =
    mode === "full" || mode === "home" ? `<p class="ui-lang-tagline" data-i18n="uiLangTagline"></p>` : "";
  const label = mode === "compact" || mode === "tv" ? "" : `<p class="control-label" data-i18n="uiLangLabel"></p>`;
  const hint = mode === "full" ? `<p class="hint ui-lang-hint" data-i18n="uiLangHint"></p>` : "";
  const extra =
    mode === "tv"
      ? " ui-lang-compact ui-lang-tv"
      : mode === "compact"
        ? " ui-lang-compact"
        : mode === "entry"
          ? " ui-lang-entry"
          : "";
  const chips =
    mode === "tv"
      ? `<button class="chip" type="button" data-set-ui-lang="en" aria-label="English">EN</button>
        <button class="chip" type="button" data-set-ui-lang="es" aria-label="Español">ES</button>
        <button class="chip" type="button" data-set-ui-lang="pt" aria-label="Português">PT</button>`
      : `<button class="chip" type="button" data-set-ui-lang="en">English</button>
        <button class="chip" type="button" data-set-ui-lang="es">Español</button>
        <button class="chip" type="button" data-set-ui-lang="pt">Português</button>`;
  return `
    <div class="ui-lang${extra}" data-ui-lang-switch>
      ${tagline}
      ${label}
      <div class="chips" role="group" data-i18n-aria="uiLangGroup">
        ${chips}
      </div>
      ${hint}
    </div>
  `;
}

/** Relabel this screen when the interface language changes. The room stays open. */
export function bindUiLang(root: HTMLElement, onChange?: () => void): () => void {
  const onClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest<HTMLButtonElement>("[data-set-ui-lang]");
    if (!btn || !root.contains(btn)) return;
    const next = btn.dataset.setUiLang;
    if (isUiLang(next)) setUiLang(next);
  };
  root.addEventListener("click", onClick);
  const unsubscribe = subscribeUiLang(() => {
    applyI18n(root);
    onChange?.();
  });
  applyI18n(root);
  return () => {
    root.removeEventListener("click", onClick);
    unsubscribe();
  };
}

const WATCH_IDS = ["en", "es", "pt", "all"] as const;
export type WatchChipId = (typeof WATCH_IDS)[number];

const WATCH_LABEL_KEY: Record<WatchChipId, MessageKey> = {
  en: "watchEnOnly",
  es: "watchEsOnly",
  pt: "watchPtOnly",
  all: "watchAllLabel",
};

export function watchChipsHtml(attr: "data-watch" | "data-setup-watch-lang"): string {
  return WATCH_IDS.map((id) => {
    const label = t(WATCH_LABEL_KEY[id]);
    const name = id === "all" ? t("watchAllName") : LANG_LABEL[id as Lang];
    const scope = id === "all" ? t("watchAllScope") : t("watchOnly");
    const aria = escapeHtml(t("watchAria", { label }));
    return `<button class="chip watch-chip" type="button" ${attr}="${id}" aria-label="${aria}" aria-pressed="false"><span class="watch-name">${escapeHtml(name)}</span><span class="watch-scope">${escapeHtml(scope)}</span></button>`;
  }).join("");
}

const GUEST_FORMS = new Set(["Guest", "Invitado", "Convidado"]);
const HOST_FORMS = new Set(["Host", "Anfitrión", "Anfitrião"]);

/** Map a visible role label back to the English token stored on captions. */
export function canonicalRole(value: string, fallback: "Host" | "Guest"): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (GUEST_FORMS.has(trimmed)) return "Guest";
  if (HOST_FORMS.has(trimmed)) return "Host";
  return trimmed;
}

export function isDefaultRole(value: string): boolean {
  const trimmed = value.trim();
  return GUEST_FORMS.has(trimmed) || HOST_FORMS.has(trimmed);
}

export function displayRole(role: "Host" | "Guest"): string {
  return role === "Host" ? t("hostName") : t("guestName");
}

export function displaySpeaker(name: string): string {
  if (HOST_FORMS.has(name)) return t("hostName");
  if (GUEST_FORMS.has(name)) return t("guestName");
  return name;
}

const EXACT_COPY: Record<string, MessageKey> = {
  "Someone else is speaking": "someoneElse",
  "Reconnecting\u2026": "reconnecting",
  "iPhone couldn't capture speech. Type a caption — Send still reaches every phone and the TV.": "iphoneType",
  "iPhone heard nothing (no-speech). Type a caption — Send still reaches every phone and the TV.": "iphoneNoSpeech",
  "This browser has no Web Speech. Type a caption instead.": "noWebSpeech",
  "Could not start the microphone.": "couldNotStartMic",
  "The microphone stopped. Type a caption instead.": "micStopped",
  "Microphone blocked. Allow mic access for this site, or type a caption.": "micBlocked",
  "Could not reclaim the mic.": "couldNotReclaim",
  "Join link copied.": "joinLinkCopied",
  "TV link copied.": "tvLinkCopied",
};

const SOMEONE_NAMED = "Someone else is speaking \u00b7 ";

/** Show a stored English status or error in the current interface language. */
export function displayCopy(message: string): string {
  if (!message) return "";
  const exact = EXACT_COPY[message];
  if (exact) return t(exact);
  if (message.startsWith(SOMEONE_NAMED)) {
    return t("someoneElseNamed", { name: displaySpeaker(message.slice(SOMEONE_NAMED.length)) });
  }
  const safari = message.match(
    /^Safari rejected (.+) \(([^)]+)\)\. Type a caption — Send still reaches every phone and the TV\.$/,
  );
  if (safari) return t("safariRejected", { locale: safari[1], code: safari[2] });
  const langCopied = message.match(/^([A-Z]{2}) TV link copied\.$/);
  if (langCopied) return t("tvLangLinkCopied", { lang: langCopied[1] });
  return message;
}
