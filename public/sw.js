const CACHE_NAME = 'media-cache-v1';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME && caches.delete(key)))
    )
  );
});

function isMediaRequest(request) {
  return ['image', 'video', 'audio'].includes(request.destination);
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (!response || !response.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  const headers = new Headers(response.headers);
  headers.set('x-sw-cache-time', Date.now().toString());
  const data = await response.clone().blob();
  const cachedResponse = new Response(data, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  cache.put(request, cachedResponse.clone());
  return cachedResponse;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !isMediaRequest(request)) {
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        const ts = parseInt(cached.headers.get('x-sw-cache-time') || '0', 10);
        if (!isNaN(ts) && Date.now() - ts < MAX_AGE) {
          return cached;
        }
        await cache.delete(request);
      }
      try {
        return await fetchAndCache(request);
      } catch (err) {
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
