export default function cacheMedia(url) {
	if (!url) return null;
	const cleaned = url.replace(/([?&])t=\d+(&)?/, (_, sep, trailing) => (trailing ? sep : ""));
	return `${cleaned}${cleaned.includes("?") ? "&" : "?"}t=${Date.now()}`;
}
