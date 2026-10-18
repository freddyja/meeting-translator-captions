// The build stamps BUILD with the deploy id (vite.config.ts), so every deploy ships a
// byte-different sw.js and the browser always sees an update.
const BUILD = "__BUILD_ID__";
const CACHE = `meeting-translator-v16-${BUILD}`;
const PRECACHE = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/bg-office-mics.webp",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-192-maskable.png",
  "/icon-512-maskable.png",
];

const PASS = new Set(["/caption-ws", "/health", "/version.json", "/api/translate", "/api/login", "/api/auth"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
      // First install: take over now. Updates wait until the page says the
      // speaker is idle (no live mic, caption or room) and posts SKIP_WAITING.
      .then(() => (self.registration.active ? undefined : self.skipWaiting())),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
      event.respondWith(staleWhileRevalidate(req));
    }
    return;
  }

  if (PASS.has(url.pathname) || url.pathname.startsWith("/caption-ws")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put("/index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("/index.html").then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    }),
  );
});

function staleWhileRevalidate(req) {
  return caches.open(CACHE).then((cache) =>
    cache.match(req).then((hit) => {
      const pending = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => hit);
      return hit || pending;
    }),
  );
}
