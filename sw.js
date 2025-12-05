
// sw.js
const CACHE_STATIC = 'static-v2';           // bump bei Änderungen
const CACHE_RUNTIME = 'runtime-v1';         // für dynamische, same-origin GETs
const APP_BASE = self.registration.scope;   // Basis-URL (automatisch)

// Assets, die du immer vorcachen willst:
const PRECACHE = [
  APP_BASE,
  APP_BASE + 'index.html',
  APP_BASE + 'manifest.json',
  APP_BASE + 'main.js',
  APP_BASE + 'icons/icon-192.png',
  APP_BASE + 'icons/icon-512.png'
];

// --- Install: Precache ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// --- Activate: alte Caches löschen + Clients claimen ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => ![CACHE_STATIC, CACHE_RUNTIME].includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// --- Helper: Bestimme, ob wir einen Request cachen dürfen ---
function isSameOrigin(url) {
  return url.origin === self.location.origin;
}
function isNavigational(req) {
  return req.mode === 'navigate';
}
function isSafeToCache(req) {
  // Nur GET und same-origin; niemals Graph/AUTH/POST etc. cachen
  if (req.method !== 'GET') return false;
  const url = new URL(req.url);
  if (!isSameOrigin(url)) return false;

  // Optional: Exkludiere sensible Pfade
  if (url.pathname.startsWith('/auth-callback')) return false;

  return true;
}

// --- Fetch: Strategien ---
// - Navigation: Offline-Fallback auf index.html (SPA)
// - Static: Cache-first
// - Runtime same-origin GET: stale-while-revalidate
// - Extern/Graph: direkt fetch (nicht cachen)
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1) Navigations-Requests (HTML, SPA)
  if (isNavigational(request)) {
    event.respondWith(
      fetch(request).catch(() => caches.match(APP_BASE + 'index.html'))
    );
    return;
  }

  // 2) Externe Origins (z. B. Microsoft Graph): niemals cachen
  if (!isSameOrigin(url)) {
    return; // Standard-Fetch greift (keine respondWith) → Netzwerk direkt
  }

  // 3) Statische Assets aus PRECACHE: Cache-first
  if (PRECACHE.includes(url.href)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
    return;
  }

  // 4) Runtime: Stale-While-Revalidate für same-origin GET
  if (isSafeToCache(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_RUNTIME);
      const cached = await cache.match(request);
      const networkPromise = fetch(request).then(resp => {
        // Nur erfolgreiche Antworten cachen
        if (resp.ok) cache.put(request, resp.clone());
        return resp;
      }).catch(() => null);

      // Sofort gecachte Antwort liefern, parallel aktualisieren
      return cached || networkPromise || new Response('Offline', { status: 503 });
    })());
    return;
  }

  // 5) Fallback: direkt aus dem Netz (nicht cachen)
  // kein respondWith => Browser macht Standard-Fetch
});
