import { startApp } from "./app";
import { initHaptics } from "./haptics-dom";
import { initInstallCapture } from "./install";
import "./styles.css";
import { initAutoUpdate } from "./update/auto-update";

initInstallCapture();
initHaptics();

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
startApp(root);

if (import.meta.env.PROD) initAutoUpdate();
