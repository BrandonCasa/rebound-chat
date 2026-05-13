import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";

import { buildDefaultSettings } from "../defaults.js";
import { autoOptimize } from "../autoOptimize.js";
import { migrateSettings } from "./migrate.js";
import { STREAM_SETTINGS_SCHEMA_VERSION } from "./schema.js";

const readJson = async (path) => {
	try {
		const raw = await readFile(path, "utf8");
		return JSON.parse(raw);
	} catch (_err) {
		return null;
	}
};

const writeJsonAtomic = async (path, value) => {
	const tmpPath = `${path}.tmp`;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tmpPath, path);
};

const createSettingsStore = ({ app, getCapabilities }) => {
	const settingsPath = join(app.getPath("userData"), "stream-settings.json");

	const buildOptimizedDefaults = async () => {
		const capabilities = await getCapabilities();
		return autoOptimize(capabilities, buildDefaultSettings());
	};

	const load = async () => {
		const raw = await readJson(settingsPath);
		const migrated = migrateSettings(raw);
		if (migrated?.settings) {
			return migrated.settings;
		}
		const settings = await buildOptimizedDefaults();
		await writeJsonAtomic(settingsPath, {
			schemaVersion: STREAM_SETTINGS_SCHEMA_VERSION,
			savedAt: Date.now(),
			settings,
		});
		return settings;
	};

	const save = async (settings) => {
		await writeJsonAtomic(settingsPath, {
			schemaVersion: STREAM_SETTINGS_SCHEMA_VERSION,
			savedAt: Date.now(),
			settings,
		});
		return settings;
	};

	const reset = async () => {
		const settings = await buildOptimizedDefaults();
		return save(settings);
	};

	return {
		load,
		save,
		reset,
		path: settingsPath,
	};
};

export { createSettingsStore };
