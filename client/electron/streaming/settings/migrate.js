import { STREAM_SETTINGS_SCHEMA_VERSION } from "./schema.js";

const migrateSettings = (raw) => {
	if (!raw || typeof raw !== "object") return null;
	const sourceVersion = Number(raw.schemaVersion || 0);
	if (sourceVersion > STREAM_SETTINGS_SCHEMA_VERSION) return null;
	return {
		...raw,
		schemaVersion: STREAM_SETTINGS_SCHEMA_VERSION,
	};
};

export { migrateSettings };
