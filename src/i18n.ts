import { escapeHtml } from "./dom.ts";
import { LANG_LABEL, type Lang } from "./types.ts";

/**
 * Interface language — the labels on the screens. This is not Spoken and not Watch.
 * Spoken still sets the microphone recognizer (en-US / es-ES / pt-BR).
 * Watch still chooses which caption panes this phone shows.
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
  uiLangLabel: "Interface",
  uiLangGroup: "Interface language",
  uiLangHint: "Labels on this device only. Spoken still sets the microphone language.",
  uiLangTagline:
    "Break language barriers in your small groups. No equipment needed - works on any device.",
  homeLede:
    "Live multilingual meeting captions. A phone captures the speaker; every phone and the TV show English, Spanish, and Portuguese windows.",
  createRoom: "Create room",
  haveRoomCode: "Have a room code?",
  roomCode: "Room code",
  openTvWindows: "Open TV windows",
  joinThisPhone: "Join on this phone",
  homeHint:
    "Host: <strong>Chrome</strong> on Android (not Samsung Internet). Guests: scan <strong>Join on phones</strong> in <strong>Chrome on Android</strong> or <strong>Safari / Chrome on iPhone</strong> — no app store install. <strong>Send to TV</strong> opens the caption page in the TV’s own browser. <strong>Smart View mode</strong> mirrors this phone’s caption layout.",
  meetingMode: "Meeting mode",
  offlineLocal: "Offline / Local meeting",
  offlineAria: "Offline / Local meeting — use the built-in dictionary, no MyMemory",
  offlineBannerBefore: "Offline translate (limited phrases). For full local setup see ",
  laptopSteps: "laptop steps",
  offlineBannerAfter: ".",
  offlineHint:
    "On: built-in dictionary (no MyMemory). Off: hosted default (MyMemory, then MinT if the daily quota is gone).",
  offlineLimited: "Offline translate (limited phrases).",
  installTitle: "Install on this phone",
  installApp: "Install app",
  installStandaloneCopy:
    "This is the installed Meeting Translator app. Create a room here, then open the TV link on the meeting TV.",
  installStandalone1: "Tap <strong>Create room</strong>.",
  installStandalone2:
    "Use <strong>Send to TV</strong> (QR / TV browser) or <strong>Smart View mode</strong> (mirror captions from the phone quick panel).",
  installStandalone3:
    "Keep this phone on the app while you speak. Exit Smart View mode to return to mic controls.",
  installDoneCopy: "Installed. Open Meeting Translator from your home screen.",
  installDone1: "Find the <strong>Meeting Translator</strong> icon on the home screen.",
  installDone2: "Launch it — you should see this app without the browser address bar.",
  installDone3: "Create a room, then open the TV link on the TV.",
  installGuideCopy:
    "Add Meeting Translator to the home screen like a normal app. The meeting is then a tap — no git or npm.",
  installReady1: "Tap <strong>Install app</strong> above and confirm.",
  installReady2:
    "Open <strong>Meeting Translator</strong> from the home screen (standalone, no address bar).",
  installReady3: "Create the room on the phone, then open the TV link on the TV.",
  installManual1:
    "Stay in <strong>Chrome</strong> on Android (not Samsung Internet). On iPhone, use Safari.",
  installManual2:
    "Tap the browser menu → <strong>Install app</strong> or <strong>Add to Home screen</strong>.",
  installManual3: "Open <strong>Meeting Translator</strong> from the home screen, then create a room.",
  localTitle: "Laptop LAN / hotspot",
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
  localOfflineHint:
    "Turn on <strong>Offline / Local meeting</strong> so captions use the built-in dictionary (no MyMemory). Optional laptop env: <code>TRANSLATE_PROVIDER=mock</code>.",
  joinSetupLead: "Room <strong>{room}</strong>. Answer two questions, then join.",
  spokenQuestion: "What language are you speaking?",
  watchQuestion: "What language do you want to watch?",
  spokenWatchHint:
    "Spoken is for your mic and typed captions. Watch is the caption language on this phone only.",
  yourName: "Your name",
  optional: "Optional",
  join: "Join",
  leave: "Leave",
  roomWord: "Room",
  spokenLanguage: "Spoken language",
  spokenShort: "Spoken",
  spokenLanguageNamed: "Spoken language: {name}",
  watch: "Watch",
  watchOnly: "only",
  watchAllName: "All three",
  watchEnOnly: "English only",
  watchEsOnly: "Español only",
  watchPtOnly: "Português only",
  watchAllLabel: "All three (EN | ES | PT)",
  watchAria: "Watch {label}",
  start: "Start",
  stop: "Stop",
  wait: "Wait",
  typeCaption: "Type a caption",
  orTypeCaption: "Or type a caption",
  waitSomeonePlaceholder: "Wait — someone else is speaking",
  send: "Send",
  sttHttps: "This join link must be HTTPS for the microphone. You can still watch captions and type to send.",
  sttNeedsChrome: "Live mic needs Chrome on Android. On iPhone you can always watch — type a caption to speak.",
  sttPreferType:
    "If the mic does not start (common on iPhone Safari), type a caption instead. One person at a time.",
  sttSameMeeting: "Same meeting as the host phone and the TV. One person speaks at a time.",
  onPhones: "{n} on phones",
  onPhonesSuffix: " · {n} on phones",
  joined: "Joined",
  tvConnected: "TV connected ({n})",
  tvConnectedSuffix: " · TV connected ({n})",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  listeningDot: "Listening · {note}",
  floorYouType: "You have the floor — speak if the mic works, or type a caption.",
  floorYouSpeaking: "You're speaking — captions go to every phone and the TV.",
  floorYouHaveMic: "You have the mic. Type a caption, or Stop to free the floor.",
  floorMicFreeType: "Mic is free. Type a caption to send it to every phone and the TV.",
  floorMicFreeStart: "Mic is free. Pick a spoken language, then Start — or type a caption.",
  youreSpeaking: "You're speaking",
  floorMicFreeGuests: "Mic is free. Guests can take a turn from their phones.",
  listeningEllipsis: "Listening…",
  captionsWillAppear: "Captions will appear here and on the TV.",
  waitingForTv: "Waiting for TV",
  onThisPhone: "On this phone",
  reclaimMic: "Reclaim mic",
  micChromeHint: "Keep Chrome in the foreground while you speak.",
  tvLayout: "TV layout",
  clearWindows: "Clear windows",
  sendToTv: "Send to TV",
  sendToTvAria: "Send to TV — show QR and TV caption link",
  smartViewMode: "Smart View mode",
  smartViewAria: "Smart View mode — show caption layout for system mirroring",
  joinOnPhones: "Join on phones",
  joinPhonesAria: "Join on phones — show QR so guests can watch and speak",
  close: "Close",
  copyTvLink: "Copy TV link",
  sendTvStep1: "On the TV browser, open this link or scan the QR.",
  sendTvStep2: "Keep the Fold on the mic page.",
  sendTvStep3:
    "Optional: three Chrome windows, one language per monitor — use the EN / ES / PT links below. That does not change other TVs in this room.",
  openTvView: "Open TV view",
  openTvAria: "Open TV view on this device for testing",
  oneLanguagePerMonitor: "One language per monitor",
  perMonitorHint:
    "Same room. Each window shows only that language, full-screen captions. Other TVs and Smart View still follow the layout chips.",
  copyLangLink: "Copy {lang} link",
  open: "Open",
  scanToWatch: "Scan to watch and speak",
  copyJoinLink: "Copy join link",
  joinStep1: "Each person scans this QR (camera app or Chrome) — Android or iPhone.",
  joinStep2:
    "They choose the language they are speaking and the language they want to watch, then tap Join. Watch on their phone can show one language or all three — that does not change this phone or the TV. The join link is HTTPS so the mic can work.",
  joinStep3:
    "One speaker at a time. Chrome on Android is best for live speech; iPhone can always watch, and type a caption if the mic is not available.",
  smartViewTip: "Now open system Smart View → My TV. TV will mirror these captions.",
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
  iphoneType: "iPhone couldn't capture speech. Type a caption — Send still reaches every phone and the TV.",
  iphoneNoSpeech:
    "iPhone heard nothing (no-speech). Type a caption — Send still reaches every phone and the TV.",
  safariRejected:
    "Safari rejected {locale} ({code}). Type a caption — Send still reaches every phone and the TV.",
  noWebSpeech: "This browser has no Web Speech. Type a caption instead.",
  couldNotStartMic: "Could not start the microphone.",
  micStopped: "The microphone stopped. Type a caption instead.",
  micBlocked: "Microphone blocked. Allow mic access for this site, or type a caption.",
} as const;

export type MessageKey = keyof typeof en;

type Catalog = { [K in MessageKey]: string };

const es: Catalog = {
  uiLangLabel: "Idioma",
  uiLangGroup: "Idioma de la interfaz",
  uiLangHint: "Solo los textos en este dispositivo. Hablado sigue definiendo el idioma del micrófono.",
  uiLangTagline:
    "Rompe las barreras del idioma en tus grupos pequeños. No necesitas equipo - funciona en cualquier dispositivo.",
  homeLede:
    "Subtítulos en vivo para la reunión, en varios idiomas. Un teléfono captura a quien habla; cada teléfono y el TV muestran ventanas en inglés, español y portugués.",
  createRoom: "Crear sala",
  haveRoomCode: "¿Tienes un código de sala?",
  roomCode: "Código de la sala",
  openTvWindows: "Abrir ventanas del TV",
  joinThisPhone: "Entrar en este teléfono",
  homeHint:
    "Anfitrión: <strong>Chrome</strong> en Android (no Samsung Internet). Invitados: escanea <strong>Unirse en los teléfonos</strong> con <strong>Chrome en Android</strong> o <strong>Safari / Chrome en iPhone</strong> — sin tienda de apps. <strong>Enviar al TV</strong> abre los subtítulos en el navegador del TV. <strong>Modo Smart View</strong> refleja el diseño de subtítulos de este teléfono.",
  meetingMode: "Modo de reunión",
  offlineLocal: "Sin conexión / reunión local",
  offlineAria: "Sin conexión / reunión local — usar el diccionario integrado, sin MyMemory",
  offlineBannerBefore: "Traducción sin conexión (frases limitadas). Para la configuración local completa, ver ",
  laptopSteps: "pasos en la laptop",
  offlineBannerAfter: ".",
  offlineHint:
    "Activado: diccionario integrado (sin MyMemory). Desactivado: predeterminado del servidor (MyMemory y, si se acaba la cuota diaria, MinT).",
  offlineLimited: "Traducción sin conexión (frases limitadas).",
  installTitle: "Instalar en este teléfono",
  installApp: "Instalar app",
  installStandaloneCopy:
    "Esta es la app Meeting Translator instalada. Crea una sala aquí y luego abre el enlace del TV en el televisor de la reunión.",
  installStandalone1: "Toca <strong>Crear sala</strong>.",
  installStandalone2:
    "Usa <strong>Enviar al TV</strong> (QR / navegador del TV) o <strong>Modo Smart View</strong> (refleja los subtítulos desde el panel rápido del teléfono).",
  installStandalone3:
    "Deja este teléfono en la app mientras hablas. Sal del modo Smart View para volver a los controles del micrófono.",
  installDoneCopy: "Instalada. Abre Meeting Translator desde la pantalla de inicio.",
  installDone1: "Busca el icono de <strong>Meeting Translator</strong> en la pantalla de inicio.",
  installDone2: "Ábrela — deberías ver esta app sin la barra de direcciones del navegador.",
  installDone3: "Crea una sala y luego abre el enlace del TV en el televisor.",
  installGuideCopy:
    "Agrega Meeting Translator a la pantalla de inicio como una app normal. La reunión queda a un toque — sin git ni npm.",
  installReady1: "Toca <strong>Instalar app</strong> arriba y confirma.",
  installReady2:
    "Abre <strong>Meeting Translator</strong> desde la pantalla de inicio (independiente, sin barra de direcciones).",
  installReady3: "Crea la sala en el teléfono y luego abre el enlace del TV en el televisor.",
  installManual1:
    "Quédate en <strong>Chrome</strong> en Android (no Samsung Internet). En iPhone, usa Safari.",
  installManual2:
    "Toca el menú del navegador → <strong>Instalar app</strong> o <strong>Agregar a pantalla de inicio</strong>.",
  installManual3: "Abre <strong>Meeting Translator</strong> desde la pantalla de inicio y crea una sala.",
  localTitle: "Laptop en la red local / hotspot",
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
  localOfflineHint:
    "Activa <strong>Sin conexión / reunión local</strong> para que los subtítulos usen el diccionario integrado (sin MyMemory). Entorno opcional en la laptop: <code>TRANSLATE_PROVIDER=mock</code>.",
  joinSetupLead: "Sala <strong>{room}</strong>. Responde dos preguntas y entra.",
  spokenQuestion: "¿En qué idioma vas a hablar?",
  watchQuestion: "¿Qué idioma quieres ver?",
  spokenWatchHint:
    "Hablado es para tu micrófono y los subtítulos que escribes. Ver es solo el idioma de los subtítulos en este teléfono.",
  yourName: "Tu nombre",
  optional: "Opcional",
  join: "Entrar",
  leave: "Salir",
  roomWord: "Sala",
  spokenLanguage: "Idioma hablado",
  spokenShort: "Hablado",
  spokenLanguageNamed: "Idioma hablado: {name}",
  watch: "Ver",
  watchOnly: "solo",
  watchAllName: "Los tres",
  watchEnOnly: "Solo inglés",
  watchEsOnly: "Solo español",
  watchPtOnly: "Solo portugués",
  watchAllLabel: "Los tres (EN | ES | PT)",
  watchAria: "Ver {label}",
  start: "Iniciar",
  stop: "Detener",
  wait: "Espera",
  typeCaption: "Escribe un subtítulo",
  orTypeCaption: "O escribe un subtítulo",
  waitSomeonePlaceholder: "Espera — otra persona está hablando",
  send: "Enviar",
  sttHttps:
    "Este enlace para entrar debe ser HTTPS para el micrófono. Igual puedes ver los subtítulos y escribir para enviar.",
  sttNeedsChrome:
    "El micrófono en vivo necesita Chrome en Android. En iPhone siempre puedes ver — escribe un subtítulo para hablar.",
  sttPreferType:
    "Si el micrófono no arranca (común en Safari del iPhone), escribe un subtítulo. Una persona a la vez.",
  sttSameMeeting: "La misma reunión que el teléfono anfitrión y el TV. Habla una persona a la vez.",
  onPhones: "{n} en teléfonos",
  onPhonesSuffix: " · {n} en teléfonos",
  joined: "Conectado",
  tvConnected: "TV conectado ({n})",
  tvConnectedSuffix: " · TV conectado ({n})",
  connecting: "Conectando…",
  reconnecting: "Reconectando…",
  listeningDot: "Escuchando · {note}",
  floorYouType: "Tienes la palabra — habla si el micrófono funciona, o escribe un subtítulo.",
  floorYouSpeaking: "Estás hablando — los subtítulos van a cada teléfono y al TV.",
  floorYouHaveMic: "Tienes el micrófono. Escribe un subtítulo, o Detener para soltar la palabra.",
  floorMicFreeType: "El micrófono está libre. Escribe un subtítulo para enviarlo a cada teléfono y al TV.",
  floorMicFreeStart: "El micrófono está libre. Elige el idioma hablado y luego Iniciar — o escribe un subtítulo.",
  youreSpeaking: "Estás hablando",
  floorMicFreeGuests: "El micrófono está libre. Los invitados pueden tomar un turno desde sus teléfonos.",
  listeningEllipsis: "Escuchando…",
  captionsWillAppear: "Los subtítulos aparecerán aquí y en el TV.",
  waitingForTv: "Esperando el TV",
  onThisPhone: "En este teléfono",
  reclaimMic: "Recuperar micrófono",
  micChromeHint: "Deja Chrome en primer plano mientras hablas.",
  tvLayout: "Diseño del TV",
  clearWindows: "Borrar ventanas",
  sendToTv: "Enviar al TV",
  sendToTvAria: "Enviar al TV — mostrar el QR y el enlace de subtítulos del TV",
  smartViewMode: "Modo Smart View",
  smartViewAria: "Modo Smart View — mostrar el diseño de subtítulos para el reflejo del sistema",
  joinOnPhones: "Unirse en los teléfonos",
  joinPhonesAria: "Unirse en los teléfonos — mostrar el QR para que los invitados vean y hablen",
  close: "Cerrar",
  copyTvLink: "Copiar enlace del TV",
  sendTvStep1: "En el navegador del TV, abre este enlace o escanea el QR.",
  sendTvStep2: "Deja el Fold en la página del micrófono.",
  sendTvStep3:
    "Opcional: tres ventanas de Chrome, un idioma por monitor — usa los enlaces EN / ES / PT de abajo. Eso no cambia los otros TV de esta sala.",
  openTvView: "Abrir vista de TV",
  openTvAria: "Abrir la vista de TV en este dispositivo para probar",
  oneLanguagePerMonitor: "Un idioma por monitor",
  perMonitorHint:
    "La misma sala. Cada ventana muestra solo ese idioma, a pantalla completa. Los otros TV y Smart View siguen los botones de diseño.",
  copyLangLink: "Copiar enlace {lang}",
  open: "Abrir",
  scanToWatch: "Escanea para ver y hablar",
  copyJoinLink: "Copiar enlace para entrar",
  joinStep1: "Cada persona escanea este QR (app de cámara o Chrome) — Android o iPhone.",
  joinStep2:
    "Eligen el idioma en el que hablan y el idioma que quieren ver, y tocan Entrar. Ver en su teléfono puede mostrar un idioma o los tres — eso no cambia este teléfono ni el TV. El enlace es HTTPS para que el micrófono pueda funcionar.",
  joinStep3:
    "Una persona habla a la vez. Chrome en Android es lo mejor para la voz en vivo; en iPhone siempre se puede ver, y escribir un subtítulo si el micrófono no está disponible.",
  smartViewTip: "Ahora abre Smart View del sistema → My TV. El TV reflejará estos subtítulos.",
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
  iphoneType:
    "El iPhone no pudo captar la voz. Escribe un subtítulo — Enviar igual llega a cada teléfono y al TV.",
  iphoneNoSpeech:
    "El iPhone no oyó nada (no-speech). Escribe un subtítulo — Enviar igual llega a cada teléfono y al TV.",
  safariRejected:
    "Safari rechazó {locale} ({code}). Escribe un subtítulo — Enviar igual llega a cada teléfono y al TV.",
  noWebSpeech: "Este navegador no tiene Web Speech. Escribe un subtítulo.",
  couldNotStartMic: "No se pudo iniciar el micrófono.",
  micStopped: "El micrófono se detuvo. Escribe un subtítulo.",
  micBlocked: "Micrófono bloqueado. Permite el micrófono en este sitio, o escribe un subtítulo.",
};

const pt: Catalog = {
  uiLangLabel: "Idioma",
  uiLangGroup: "Idioma da interface",
  uiLangHint: "Só os textos neste aparelho. Falado continua definindo o idioma do microfone.",
  uiLangTagline:
    "Quebre as barreiras do idioma nos seus grupos pequenos. Não precisa de equipamento - funciona em qualquer aparelho.",
  homeLede:
    "Legendas ao vivo para a reunião, em vários idiomas. Um telefone captura quem fala; cada telefone e a TV mostram janelas em inglês, espanhol e português.",
  createRoom: "Criar sala",
  haveRoomCode: "Tem um código da sala?",
  roomCode: "Código da sala",
  openTvWindows: "Abrir janelas da TV",
  joinThisPhone: "Entrar neste telefone",
  homeHint:
    "Anfitrião: <strong>Chrome</strong> no Android (não Samsung Internet). Convidados: escaneie <strong>Entrar nos telefones</strong> no <strong>Chrome no Android</strong> ou no <strong>Safari / Chrome no iPhone</strong> — sem loja de apps. <strong>Enviar para a TV</strong> abre as legendas no navegador da TV. <strong>Modo Smart View</strong> espelha o layout das legendas deste telefone.",
  meetingMode: "Modo da reunião",
  offlineLocal: "Sem internet / reunião local",
  offlineAria: "Sem internet / reunião local — usar o dicionário interno, sem MyMemory",
  offlineBannerBefore: "Tradução offline (frases limitadas). Para a configuração local completa, ver ",
  laptopSteps: "passos no laptop",
  offlineBannerAfter: ".",
  offlineHint:
    "Ligado: dicionário interno (sem MyMemory). Desligado: padrão do servidor (MyMemory e, se a cota diária acabar, MinT).",
  offlineLimited: "Tradução offline (frases limitadas).",
  installTitle: "Instalar neste telefone",
  installApp: "Instalar app",
  installStandaloneCopy:
    "Este é o app Meeting Translator instalado. Crie uma sala aqui e depois abra o link da TV na televisão da reunião.",
  installStandalone1: "Toque em <strong>Criar sala</strong>.",
  installStandalone2:
    "Use <strong>Enviar para a TV</strong> (QR / navegador da TV) ou <strong>Modo Smart View</strong> (espelha as legendas pelo painel rápido do telefone).",
  installStandalone3:
    "Deixe este telefone no app enquanto você fala. Saia do modo Smart View para voltar aos controles do microfone.",
  installDoneCopy: "Instalado. Abra o Meeting Translator pela tela inicial.",
  installDone1: "Encontre o ícone do <strong>Meeting Translator</strong> na tela inicial.",
  installDone2: "Abra — você deve ver este app sem a barra de endereço do navegador.",
  installDone3: "Crie uma sala e depois abra o link da TV na televisão.",
  installGuideCopy:
    "Adicione o Meeting Translator à tela inicial como um app normal. A reunião fica a um toque — sem git nem npm.",
  installReady1: "Toque em <strong>Instalar app</strong> acima e confirme.",
  installReady2: "Abra o <strong>Meeting Translator</strong> pela tela inicial (sozinho, sem barra de endereço).",
  installReady3: "Crie a sala no telefone e depois abra o link da TV na televisão.",
  installManual1: "Fique no <strong>Chrome</strong> no Android (não Samsung Internet). No iPhone, use o Safari.",
  installManual2:
    "Toque no menu do navegador → <strong>Instalar app</strong> ou <strong>Adicionar à Tela de Início</strong>.",
  installManual3: "Abra o <strong>Meeting Translator</strong> pela tela inicial e crie uma sala.",
  localTitle: "Laptop na rede local / hotspot",
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
  localOfflineHint:
    "Ative <strong>Sem internet / reunião local</strong> para as legendas usarem o dicionário interno (sem MyMemory). Ambiente opcional no laptop: <code>TRANSLATE_PROVIDER=mock</code>.",
  joinSetupLead: "Sala <strong>{room}</strong>. Responda duas perguntas e entre.",
  spokenQuestion: "Em que idioma você vai falar?",
  watchQuestion: "Que idioma você quer ver?",
  spokenWatchHint:
    "Falado é para o seu microfone e as legendas digitadas. Ver é só o idioma das legendas neste telefone.",
  yourName: "Seu nome",
  optional: "Opcional",
  join: "Entrar",
  leave: "Sair",
  roomWord: "Sala",
  spokenLanguage: "Idioma falado",
  spokenShort: "Falado",
  spokenLanguageNamed: "Idioma falado: {name}",
  watch: "Ver",
  watchOnly: "só",
  watchAllName: "Os três",
  watchEnOnly: "Só inglês",
  watchEsOnly: "Só espanhol",
  watchPtOnly: "Só português",
  watchAllLabel: "Os três (EN | ES | PT)",
  watchAria: "Ver {label}",
  start: "Iniciar",
  stop: "Parar",
  wait: "Aguarde",
  typeCaption: "Digite uma legenda",
  orTypeCaption: "Ou digite uma legenda",
  waitSomeonePlaceholder: "Aguarde — outra pessoa está falando",
  send: "Enviar",
  sttHttps:
    "Este link para entrar precisa ser HTTPS para o microfone. Você ainda pode ver as legendas e digitar para enviar.",
  sttNeedsChrome:
    "O microfone ao vivo precisa do Chrome no Android. No iPhone você sempre pode ver — digite uma legenda para falar.",
  sttPreferType:
    "Se o microfone não iniciar (comum no Safari do iPhone), digite uma legenda. Uma pessoa por vez.",
  sttSameMeeting: "A mesma reunião do telefone anfitrião e da TV. Uma pessoa fala por vez.",
  onPhones: "{n} nos telefones",
  onPhonesSuffix: " · {n} nos telefones",
  joined: "Conectado",
  tvConnected: "TV conectada ({n})",
  tvConnectedSuffix: " · TV conectada ({n})",
  connecting: "Conectando…",
  reconnecting: "Reconectando…",
  listeningDot: "Ouvindo · {note}",
  floorYouType: "Você tem a palavra — fale se o microfone funcionar, ou digite uma legenda.",
  floorYouSpeaking: "Você está falando — as legendas vão para cada telefone e para a TV.",
  floorYouHaveMic: "Você tem o microfone. Digite uma legenda, ou Parar para liberar a palavra.",
  floorMicFreeType: "O microfone está livre. Digite uma legenda para enviá-la a cada telefone e à TV.",
  floorMicFreeStart: "O microfone está livre. Escolha o idioma falado e depois Iniciar — ou digite uma legenda.",
  youreSpeaking: "Você está falando",
  floorMicFreeGuests: "O microfone está livre. Os convidados podem falar a partir dos telefones deles.",
  listeningEllipsis: "Ouvindo…",
  captionsWillAppear: "As legendas vão aparecer aqui e na TV.",
  waitingForTv: "Aguardando a TV",
  onThisPhone: "Neste telefone",
  reclaimMic: "Retomar microfone",
  micChromeHint: "Deixe o Chrome em primeiro plano enquanto você fala.",
  tvLayout: "Layout da TV",
  clearWindows: "Limpar janelas",
  sendToTv: "Enviar para a TV",
  sendToTvAria: "Enviar para a TV — mostrar o QR e o link das legendas da TV",
  smartViewMode: "Modo Smart View",
  smartViewAria: "Modo Smart View — mostrar o layout das legendas para o espelhamento do sistema",
  joinOnPhones: "Entrar nos telefones",
  joinPhonesAria: "Entrar nos telefones — mostrar o QR para os convidados verem e falarem",
  close: "Fechar",
  copyTvLink: "Copiar link da TV",
  sendTvStep1: "No navegador da TV, abra este link ou escaneie o QR.",
  sendTvStep2: "Deixe o Fold na página do microfone.",
  sendTvStep3:
    "Opcional: três janelas do Chrome, um idioma por monitor — use os links EN / ES / PT abaixo. Isso não muda as outras TVs desta sala.",
  openTvView: "Abrir visão da TV",
  openTvAria: "Abrir a visão da TV neste aparelho para testar",
  oneLanguagePerMonitor: "Um idioma por monitor",
  perMonitorHint:
    "A mesma sala. Cada janela mostra só aquele idioma, em tela cheia. As outras TVs e o Smart View continuam seguindo os botões de layout.",
  copyLangLink: "Copiar link {lang}",
  open: "Abrir",
  scanToWatch: "Escaneie para ver e falar",
  copyJoinLink: "Copiar link para entrar",
  joinStep1: "Cada pessoa escaneia este QR (app da câmera ou Chrome) — Android ou iPhone.",
  joinStep2:
    "Elas escolhem o idioma que estão falando e o idioma que querem ver, e tocam em Entrar. Ver no telefone delas pode mostrar um idioma ou os três — isso não muda este telefone nem a TV. O link é HTTPS para o microfone poder funcionar.",
  joinStep3:
    "Uma pessoa fala por vez. O Chrome no Android é o melhor para a voz ao vivo; no iPhone sempre dá para ver, e digitar uma legenda se o microfone não estiver disponível.",
  smartViewTip: "Agora abra o Smart View do sistema → My TV. A TV vai espelhar estas legendas.",
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
  iphoneType:
    "O iPhone não conseguiu captar a fala. Digite uma legenda — Enviar ainda chega a cada telefone e à TV.",
  iphoneNoSpeech:
    "O iPhone não ouviu nada (no-speech). Digite uma legenda — Enviar ainda chega a cada telefone e à TV.",
  safariRejected:
    "O Safari recusou {locale} ({code}). Digite uma legenda — Enviar ainda chega a cada telefone e à TV.",
  noWebSpeech: "Este navegador não tem Web Speech. Digite uma legenda.",
  couldNotStartMic: "Não foi possível iniciar o microfone.",
  micStopped: "O microfone parou. Digite uma legenda.",
  micBlocked: "Microfone bloqueado. Permita o microfone neste site, ou digite uma legenda.",
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

export function setUiLang(lang: UiLang): void {
  try {
    localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
  } catch {
    /* private mode / blocked storage */
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
 * compact — chips only, beside in-room caption panes.
 */
export function uiLangSwitcherHtml(compact: boolean | "home" | "entry" = false): string {
  const mode = compact === true ? "compact" : compact === "home" || compact === "entry" ? compact : "full";
  const tagline =
    mode === "full" || mode === "home" ? `<p class="ui-lang-tagline" data-i18n="uiLangTagline"></p>` : "";
  const label = mode === "compact" ? "" : `<p class="control-label" data-i18n="uiLangLabel"></p>`;
  const hint = mode === "full" ? `<p class="hint ui-lang-hint" data-i18n="uiLangHint"></p>` : "";
  const extra = mode === "compact" ? " ui-lang-compact" : mode === "entry" ? " ui-lang-entry" : "";
  return `
    <div class="ui-lang${extra}" data-ui-lang-switch>
      ${tagline}
      ${label}
      <div class="chips" role="group" data-i18n-aria="uiLangGroup">
        <button class="chip" type="button" data-set-ui-lang="en">English</button>
        <button class="chip" type="button" data-set-ui-lang="es">Español</button>
        <button class="chip" type="button" data-set-ui-lang="pt">Português</button>
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
    const scope = id === "all" ? "EN | ES | PT" : t("watchOnly");
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
