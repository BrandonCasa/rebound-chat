/**
 * Pure string helpers for parsing manual command lines and escaping
 * filtergraph values.
 */

const escapeFilterValue = (value) =>
	String(value || "")
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/:/g, "\\:");

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sourceNameToCaseInsensitiveRegex = (name) => `(?i)^${escapeRegex(name)}$`;

const parseElectronScreenIndex = (sourceId) => {
	const match = String(sourceId || "").match(/^screen:(\d+)/);
	return match ? Number.parseInt(match[1], 10) : 0;
};

const splitCommandLine = (value) => {
	const input = String(value || "").trim();
	if (!input) return [];

	const args = [];
	let token = "";
	let quote = "";
	let escaping = false;

	for (const char of input) {
		if (escaping) {
			token += char;
			escaping = false;
			continue;
		}

		if (char === "\\") {
			escaping = true;
			continue;
		}

		if (quote) {
			if (char === quote) {
				quote = "";
			} else {
				token += char;
			}
			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}

		if (/\s/.test(char)) {
			if (token) {
				args.push(token);
				token = "";
			}
			continue;
		}

		token += char;
	}

	if (escaping) token += "\\";
	if (quote) throw new Error("Command line arguments contain an unterminated quote.");
	if (token) args.push(token);

	return args;
};

export { escapeFilterValue, escapeRegex, sourceNameToCaseInsensitiveRegex, parseElectronScreenIndex, splitCommandLine };
