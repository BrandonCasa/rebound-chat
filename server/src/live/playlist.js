import path from "node:path";

const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/;

const normalizeLineEndings = (value) =>
	String(value || "")
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n");

const ensurePlaylistText = (value) => {
	const text = normalizeLineEndings(value).trim();
	if (!text) {
		throw new Error("Playlist body is required.");
	}
	if (!text.startsWith("#EXTM3U")) {
		throw new Error("Playlist must start with #EXTM3U.");
	}
	return `${text}\n`;
};

const sanitizeUploadedFilename = (value) => {
	const raw = String(value || "").trim();
	if (!raw) {
		throw new Error("Filename is required.");
	}
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith("/") || raw.includes("\\") || raw.includes("..")) {
		throw new Error("Only flat local HLS filenames are supported.");
	}

	const withoutSuffix = raw.split("?")[0].split("#")[0];
	const clean = path.posix.basename(withoutSuffix);
	if (clean !== withoutSuffix || !SAFE_FILENAME_PATTERN.test(clean)) {
		throw new Error(`Invalid HLS filename: ${raw}`);
	}

	return clean;
};

const rewriteUriAttribute = (line) => {
	return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="segments/${sanitizeUploadedFilename(uri)}"`);
};

const normalizeMasterPlaylist = (rawPlaylist) => {
	const playlist = ensurePlaylistText(rawPlaylist);
	const lines = playlist.split("\n");
	let variantLines = 0;

	const normalizedLines = lines.map((line) => {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			return trimmed;
		}

		variantLines += 1;
		sanitizeUploadedFilename(trimmed);
		return "video.m3u8";
	});

	if (variantLines === 0) {
		throw new Error("Master playlist must reference a media playlist.");
	}
	if (variantLines > 1) {
		throw new Error("Only a single media playlist variant is supported in the live relay.");
	}

	return `${normalizedLines.filter((line) => line !== "").join("\n")}\n`;
};

const normalizeMediaPlaylist = (rawPlaylist) => {
	const playlist = ensurePlaylistText(rawPlaylist);
	const referencedSegmentNames = [];
	const lines = playlist.split("\n");

	const normalizedLines = lines.map((line) => {
		const trimmed = line.trim();
		if (!trimmed) return "";

		if (trimmed.startsWith("#")) {
			if (trimmed.includes('URI="')) {
				const rewritten = rewriteUriAttribute(trimmed);
				const matches = [...rewritten.matchAll(/URI="segments\/([^"]+)"/g)];
				for (const [, filename] of matches) {
					referencedSegmentNames.push(filename);
				}
				return rewritten;
			}
			return trimmed;
		}

		const filename = sanitizeUploadedFilename(trimmed);
		referencedSegmentNames.push(filename);
		return `segments/${filename}`;
	});

	return {
		playlistText: `${normalizedLines.filter((line) => line !== "").join("\n")}\n`,
		referencedSegmentNames,
	};
};

export { normalizeMasterPlaylist, normalizeMediaPlaylist, sanitizeUploadedFilename };
