/// <reference types="vite/client" />

interface WindowEventMap {
  beforeinstallprompt: import("./install").BeforeInstallPromptEvent;
  appinstalled: Event;
}

interface ImportMetaEnv {
  readonly VITE_TRANSLATE_PROVIDER?: string;
  readonly VITE_MYMEMORY_EMAIL?: string;
  readonly VITE_LIBRETRANSLATE_URL?: string;
  readonly VITE_LIBRETRANSLATE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
