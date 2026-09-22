import { startApp } from "./app";
import { initInstallCapture } from "./install";
import "./styles.css";

initInstallCapture();

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
startApp(root);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
      /* optional */
    });
  });
}
