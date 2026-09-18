/* WAZEN PWA — app shell + last pages stay on device; API reads fall back offline. */
const SHELL = "wazen-shell-v8";
const DATA = "wazen-data-v8";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/brand/favicon-192.png",
  "/brand/favicon-512.png",
  "/brand/wazen-lockup.png",
  "/brand/wazen-app-icon.png",
];

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAuthPath(pathname) {
  return pathname.startsWith("/api/auth")
    || pathname === "/login"
    || pathname.startsWith("/login/")
    || pathname === "/register"
    || pathname === "/forgot-password"
    || pathname === "/reset-password"
    || pathname === "/verify-email"
    || pathname.startsWith("/r/")
    || pathname.startsWith("/s/")
    || pathname.startsWith("/api/jobs");
}

function isAppPage(pathname) {
  return pathname === "/"
    || pathname === "/home"
    || pathname === "/dashboard"
    || pathname === "/billing"
    || pathname === "/documents"
    || pathname === "/pricing"
    || pathname === "/account"
    || pathname.startsWith("/admin");
}

function isStaticAsset(pathname) {
  return pathname.startsWith("/_next/static/")
    || pathname.startsWith("/brand/")
    || pathname.endsWith(".png")
    || pathname.endsWith(".svg")
    || pathname.endsWith(".ico")
    || pathname.endsWith(".woff2")
    || pathname.endsWith(".webmanifest")
    || pathname === "/sw.js";
}

function isCachedApiGet(pathname) {
  return pathname === "/api/dashboard" || pathname.startsWith("/api/platform");
}

async function precache(cache, urls) {
  await Promise.all(urls.map((url) => fetch(url, { credentials: "same-origin", redirect: "manual" }).then((response) => {
    if (response.ok && response.type === "basic") return cache.put(url, response);
    return undefined;
  }).catch(() => undefined)));
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok && response.type === "basic") void cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => precache(cache, PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== SHELL && key !== DATA).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_OFFLINE_DATA") {
    event.waitUntil(caches.delete(DATA).then(() => caches.open(DATA)));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!sameOrigin(url) || isAuthPath(url.pathname)) return;
  // Let the browser follow 302s to BHD identity. Intercepting navigations
  // used to display the identity form on wazen.bhd-om.com, so Sign in reloaded itself.
  if (request.mode === "navigate") return;

  if (isCachedApiGet(url.pathname)) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          void caches.open(DATA).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(request);
        return cached || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) return;

  if (isAppPage(url.pathname)) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.ok && response.type === "basic") {
          void caches.open(SHELL).then((cache) => {
            void cache.put(request, response.clone());
            void cache.put(url.pathname, response.clone());
          });
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(request) || await caches.match(url.pathname);
        return cached || await caches.match("/") || Response.error();
      }),
    );
    return;
  }

  if (isStaticAsset(url.pathname) || request.headers.get("RSC") === "1" || request.headers.has("Next-Router-State-Tree")) {
    event.respondWith(staleWhileRevalidate(SHELL, request));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "wazen-flush") {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) client.postMessage({ type: "FLUSH_OFFLINE_QUEUE" });
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let title = "WAZEN";
  let body = "";
  let url = "/home";
  try {
    const data = event.data ? event.data.json() : {};
    title = String(data.title || title);
    body = String(data.body || "");
    url = String(data.url || url);
  } catch {
    body = event.data ? event.data.text() : "";
  }
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/brand/favicon-192.png",
    badge: "/brand/favicon-192.png",
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          void client.navigate?.(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});
