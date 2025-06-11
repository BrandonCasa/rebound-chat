export default async function cacheMedia(url) {
	if (!url) return null;
	if (typeof window === "undefined" || !("caches" in window)) {
		return url;
	}
	if (url.includes("blob:") && !url.startsWith("blob:")) {
		return `blob:${url.split("blob:")[1]}`;
	} else if (url.startsWith("blob:")) {
		return url;
	}
	if (!url.startsWith("http") && !url.startsWith("https")) {
		return url; // Not a valid URL, return as is
	}
	try {
		const cache = await caches.open("media-cache");
		let response = await cache.match(url);
		if (!response) {
			response = await fetch(url);
			if (response.ok) {
				cache.put(url, response.clone());
			} else {
				return url;
			}
		}
		const blob = await response.blob();
		return URL.createObjectURL(blob);
	} catch (err) {
		console.error("cacheMedia failed", err);
		return url;
	}
}
