const CACHE_NAME = "media-cache-v1";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ENTRIES = 100;

self.addEventListener("install", (event) => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
});

function isMediaRequest(request) {
	return ["image", "video", "audio"].includes(request.destination);
}

function isServerContentRequest(request) {
	try {
		return new URL(request.url).pathname.includes("/content/");
	} catch {
		return false;
	}
}

async function expireEntries(cache) {
	const now = Date.now();
	const requests = await cache.keys(); // these are Request objects
	const entries = [];

	for (const req of requests) {
		const resp = await cache.match(req);
		const fetchedAt = resp.headers.get("sw-fetched-at");
		entries.push({
			req,
			fetchedAt: fetchedAt ? Number(fetchedAt) : 0,
		});
	}

	// 1) remove by age
	for (const { req, fetchedAt } of entries) {
		if (now - fetchedAt > MAX_AGE) {
			await cache.delete(req);
		}
	}

	// 2) enforce max entries
	const remaining = await cache.keys();
	if (remaining.length > MAX_ENTRIES) {
		entries
			.sort((a, b) => a.fetchedAt - b.fetchedAt)
			.slice(0, remaining.length - MAX_ENTRIES)
			.forEach(({ req }) => cache.delete(req));
	}
}

async function fetchAndCache(request) {
	const response = await fetch(request.url);
	if (!response || !response.ok) return response;

	const cloned = response.clone();
	const blob = await cloned.blob();
	const headers = new Headers(response.headers);
	headers.set("sw-fetched-at", Date.now().toString());

	const entry = new Response(blob, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});

	const cache = await caches.open(CACHE_NAME);

	await cache.put(request.url, entry.clone());

	await expireEntries(cache);

	return entry;
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET" || !isMediaRequest(request) || !isServerContentRequest(request)) {
		return;
	}

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			const cached = await cache.match(request.url);
			if (cached) {
				return cached;
			}
			return await fetchAndCache(request);
		})()
	);
});
