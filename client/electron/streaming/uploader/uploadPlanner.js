const SEGMENT_EXTENSIONS = new Set([".aac", ".m4a", ".m4s", ".mp3", ".mp4", ".ts"]);

const extensionForName = (filename) => {
	const index = filename.lastIndexOf(".");
	return index >= 0 ? filename.slice(index).toLowerCase() : "";
};

const isPlaylist = (name) => name === "video.m3u8" || name === "master.m3u8";
const isInit = (name) => name === "init.mp4";
const isSegment = (name) => !isInit(name) && !isPlaylist(name) && SEGMENT_EXTENSIONS.has(extensionForName(name));

/**
 * @param {Array<{ name: string, isFile: boolean }>} listing
 * @param {{ initUploaded?: boolean }} state
 */
export function planUploadPass(listing, state = {}) {
	const files = listing.filter((entry) => entry?.isFile && typeof entry.name === "string").map((entry) => entry.name);
	const available = new Set(files);

	return {
		initFiles: state.initUploaded || !available.has("init.mp4") ? [] : ["init.mp4"],
		segments: files.filter((name) => isSegment(name)).sort((left, right) => left.localeCompare(right)),
		playlists: ["video.m3u8", "master.m3u8"].filter((name) => available.has(name)),
	};
}
