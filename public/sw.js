/* WAZEN PWA shell — caches static shell only; never caches /api or auth pages. */
const CACHE = "wazen-shell-v1";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/brand/favicon-192.png",
  "/brand/favicon-512.png",
  "/brand/wazen-lockup.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/r/") || url.pathname.startsWith("/s/")) return;

  // Navigation: network-first, fall back to cached home shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/home") || await caches.match("/") || await caches.match(request);
        return cached || Response.error();
      }),
    );
    return;
  }

  // Static assets: stale-while-revalidate
  if (
    url.pathname.startsWith("/_next/static/")
    || url.pathname.startsWith("/brand/")
    || url.pathname.endsWith(".png")
    || url.pathname.endsWith(".svg")
    || url.pathname.endsWith(".ico")
    || url.pathname.endsWith(".webmanifest")
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((response) => {
          if (response.ok) void cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || network;
      }),
    );
  }
});
