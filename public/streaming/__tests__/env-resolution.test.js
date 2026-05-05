import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";

import { buildDefaultSettings } from "../defaults.js";
import { getLiveBase } from "../../../src/helpers/live.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_IN_ELECTRON_ENV = globalThis.IN_ELECTRON_ENV;

const setNodeEnv = (value) => {
	if (value === undefined) {
		delete process.env.NODE_ENV;
		return;
	}
	process.env.NODE_ENV = value;
};

const setInElectronEnv = (value) => {
	if (value === undefined) {
		delete globalThis.IN_ELECTRON_ENV;
		return;
	}
	globalThis.IN_ELECTRON_ENV = value;
};

afterEach(() => {
	setNodeEnv(ORIGINAL_NODE_ENV);
	setInElectronEnv(ORIGINAL_IN_ELECTRON_ENV);
});

describe("helpers/live.getLiveBase env matrix", () => {
	const cases = [
		{ nodeEnv: undefined, inElectron: false, expected: "" },
		{ nodeEnv: undefined, inElectron: true, expected: "http://localhost:6001" },
		{ nodeEnv: "development", inElectron: false, expected: "" },
		{ nodeEnv: "development", inElectron: true, expected: "http://localhost:6001" },
		{ nodeEnv: "production", inElectron: false, expected: "" },
		{ nodeEnv: "production", inElectron: true, expected: "https://rebound.nexus" },
		{ nodeEnv: "test", inElectron: false, expected: "" },
		{ nodeEnv: "test", inElectron: true, expected: "" },
	];

	for (const { nodeEnv, inElectron, expected } of cases) {
		const nodeEnvLabel = nodeEnv ?? "undefined";
		const testName = `NODE_ENV=${nodeEnvLabel}, IN_ELECTRON_ENV=${String(inElectron)} -> ${expected || '""'}`;
		it(testName, () => {
			setNodeEnv(nodeEnv);
			setInElectronEnv(inElectron);
			assert.equal(getLiveBase(), expected);
		});
	}
});

describe("streaming defaults websiteBaseUrl env matrix", () => {
	const cases = [
		{ nodeEnv: undefined, inElectron: false, expected: "" },
		{ nodeEnv: undefined, inElectron: true, expected: "http://localhost:6001" },
		{ nodeEnv: "development", inElectron: false, expected: "" },
		{ nodeEnv: "development", inElectron: true, expected: "http://localhost:6001" },
		{ nodeEnv: "production", inElectron: false, expected: "" },
		{ nodeEnv: "production", inElectron: true, expected: "https://rebound.nexus" },
		{ nodeEnv: "test", inElectron: false, expected: "" },
		{ nodeEnv: "test", inElectron: true, expected: "" },
	];

	for (const { nodeEnv, inElectron, expected } of cases) {
		const nodeEnvLabel = nodeEnv ?? "undefined";
		const testName = `NODE_ENV=${nodeEnvLabel}, IN_ELECTRON_ENV=${String(inElectron)} -> ${expected || '""'}`;
		it(testName, () => {
			setNodeEnv(nodeEnv);
			setInElectronEnv(inElectron);
			const defaults = buildDefaultSettings();
			assert.equal(defaults.websiteBaseUrl, expected);
		});
	}
});
