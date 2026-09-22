import { readRoute } from "./router";
import { isRoomCode } from "./room";
import { mountHome } from "./views/home";
import { mountJoin } from "./views/join";
import { mountPhone } from "./views/phone";
import { mountTv } from "./views/tv";

export function startApp(root: HTMLElement): void {
  let unmount: (() => void) | null = null;

  const render = () => {
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

  window.addEventListener("popstate", render);
  render();
}
