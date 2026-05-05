import { createReadStream } from "fs";
import { readFile, stat } from "fs/promises";
import { Readable } from "stream";

export async function fileSignature(filePath) {
	const stats = await stat(filePath);
	if (!stats.isFile() || stats.size <= 0) return null;
	return `${stats.size}:${stats.mtimeMs}`;
}

export async function readPlaylist(filePath) {
	return readFile(filePath, "utf8");
}

export function openSegmentStream(filePath) {
	return Readable.toWeb(createReadStream(filePath));
}
