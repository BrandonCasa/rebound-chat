export default async function cacheMedia(url) {
    if (!url) return null;
    if (typeof window === "undefined" || !("caches" in window)) {
        return url;
    }
    try {
        const cache = await caches.open("media-cache");
        let response = await cache.match(url);
        if (!response) {
            response = await fetch(url, { credentials: "include" });
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
