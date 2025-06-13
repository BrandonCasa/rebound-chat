const CACHE_NAME = 'media-cache-v1';

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

function isServerContentRequest(request) {
  try {
    const url = new URL(request.url);
    return url.pathname.startsWith('/content/');
  } catch {
    return false;
  }
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (!response || !response.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  const data = await response.clone().blob();
  const cachedResponse = new Response(data, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  cache.put(request, cachedResponse.clone());
  return cachedResponse;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (
    request.method !== 'GET' ||
    !isMediaRequest(request) ||
    !isServerContentRequest(request)
  ) {
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        return cached;
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
