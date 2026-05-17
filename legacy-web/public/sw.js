const CACHE_NAME = 'arise-cache-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/','/offline.html']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Let external APIs, including Supabase, use the browser network stack directly.
  if (requestUrl.origin !== self.location.origin) return;

  // Network first for navigation and static assets
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        // If it's a navigation request, show offline page
        if (request.mode === 'navigate') {
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
        }

        // Fallback to a basic Response
        return new Response('You are offline.', {
          headers: { 'Content-Type': 'text/plain' },
        });
      })
  );
});

