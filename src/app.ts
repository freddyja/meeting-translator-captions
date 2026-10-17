import { AUTH_REQUIRED_EVENT, checkAuth, consumeLinkToken, readToken } from "./auth";
import { t } from "./i18n";
import { readRoute } from "./router";
import { isRoomCode } from "./room";
import { mountHome } from "./views/home";
import { mountJoin } from "./views/join";
import { mountPhone } from "./views/phone";
import { mountPin } from "./views/pin";
import { mountTv } from "./views/tv";

export function startApp(root: HTMLElement): void {
  let unmount: (() => void) | null = null;
  let locked = false;

  const renderRoute = () => {
    unmount?.();
    unmount = null;
    const route = readRoute();
    const guest = route.view === "join" || route.role === "guest";
    if ((route.view === "phone" || route.view === "join") && isRoomCode(route.room) && guest) {
      unmount = mountJoin(root, route.room);
      return;
    }
    if (route.view === "phone" && isRoomCode(route.room)) {
      unmount = mountPhone(root, route.room);
      return;
    }
    if (route.view === "tv" && isRoomCode(route.room)) {
      unmount = mountTv(root, route.room, route.lang);
      return;
    }
    unmount = mountHome(root);
  };

  const showPin = () => {
    if (locked) return;
    locked = true;
    unmount?.();
    unmount = mountPin(root, () => {
      locked = false;
      unmount = null;
      renderRoute();
    });
  };

  const render = () => {
    if (locked) return;
    renderRoute();
  };

  window.addEventListener("popstate", render);
  window.addEventListener(AUTH_REQUIRED_EVENT, showPin);

  // A TV link from the host may carry #k=<token>.
  consumeLinkToken();

  if (readToken()) {
    // Remembered device: open right away, re-check quietly in the background.
    render();
    void checkAuth().then((status) => {
      if (status?.required && !status.ok) showPin();
    });
    return;
  }

  root.innerHTML = `<section class="screen home-screen entry-scene scene-bg pin-wait"><p class="lede">${t("connecting")}</p></section>`;
  void checkAuth().then((status) => {
    // null = server unreachable (offline / waking): try the app; any 401 brings the pad back.
    if (status?.required && !status.ok) showPin();
    else render();
  });
}
