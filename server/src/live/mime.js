import path from "node:path";

const PLAYLIST_CONTENT_TYPE = "application/vnd.apple.mpegurl";

const SEGMENT_CONTENT_TYPES = new Map([
	[".aac", "audio/aac"],
	[".m4a", "audio/mp4"],
	[".m4s", "video/iso.segment"],
	[".mp3", "audio/mpeg"],
	[".mp4", "video/mp4"],
	[".ts", "video/mp2t"],
]);

const resolveHlsContentType = (filename) => {
	if (filename.endsWith(".m3u8")) return PLAYLIST_CONTENT_TYPE;
	return SEGMENT_CONTENT_TYPES.get(path.extname(filename).toLowerCase()) || "application/octet-stream";
};

export { PLAYLIST_CONTENT_TYPE, resolveHlsContentType };
