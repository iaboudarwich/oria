/*
 * Oria service worker (Round 15).
 *
 * PRIVACY IS THE POINT. This worker NEVER caches authenticated or
 * user-specific responses. The rules:
 *
 *   1. Only same-origin GET requests are ever considered for caching.
 *   2. Navigations (HTML documents) are network-first and are NEVER written to
 *      the cache. If the network fails, we serve the precached /offline shell.
 *      So authenticated page HTML can never land in Cache Storage.
 *   3. Runtime caching is restricted to a tight allow-list of non-sensitive
 *      static assets: /_next/static/* (built JS/CSS and self-hosted fonts),
 *      /icons/*, plus /favicon.ico and /logo.svg. Everything else
 *      (/api/*, /_next/image, cross-origin, signed file URLs, etc.) is passed
 *      straight through to the network and never touched.
 *   4. No user content (documents, finances, health, calendar) can match the
 *      allow-list, so none can be cached.
 *
 * Registration is production-only and is wired from components/pwa/sw-register.
 */

const VERSION = "v1";
const PRECACHE = `oria-precache-${VERSION}`;
const RUNTIME = `oria-runtime-${VERSION}`;
const OFFLINE_URL = "/offline";

// Minimal app shell to precache so the offline fallback works on first failure.
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png", "/logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== PRECACHE && k !== RUNTIME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Same-origin, non-sensitive static assets that are safe to runtime-cache.
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/logo.svg"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is ever handled; everything else goes straight to the network.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigations: network-first, offline shell on failure, NEVER cached.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL, { ignoreSearch: true })),
    );
    return;
  }

  // Static assets: stale-while-revalidate from the runtime cache.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            // Only cache complete, successful, basic (same-origin) responses.
            if (response.ok && response.type === "basic") {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // Everything else (/api/*, /_next/image, cross-origin, etc.): pass through.
  // No respondWith => the browser performs its normal network fetch, uncached.
});

// Web Push: payloads are intentionally generic (no sensitive data); specifics
// are fetched in-app when the user taps the notification.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Oria";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "oria",
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    (async () => {
      // Let any open tabs know a push arrived so they can refresh in the
      // foreground; then show the notification.
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) client.postMessage({ type: "push", tag: options.tag });
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
