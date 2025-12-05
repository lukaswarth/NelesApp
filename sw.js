self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('static-v1').then(cache =>
      cache.addAll(['/', '/index.html', '/manifest.json', '/main.js'])
    )
  );
});
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  );
});
