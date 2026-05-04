/**
 * Pure numeric parsers used during config normalization.
 */

const parseOptionalPositiveInt = (value, label) => {
	if (value === "" || value === null || value === undefined) return null;
	const number = Number.parseInt(String(value), 10);
	if (!Number.isFinite(number) || number < 0) {
		throw new Error(`${label} must be 0 or greater.`);
	}
	return number;
};

const parsePositiveInt = (value, label) => {
	const number = Number.parseInt(String(value), 10);
	if (!Number.isFinite(number) || number <= 0) {
		throw new Error(`${label} must be greater than 0.`);
	}
	return number;
};

const parsePositiveFloat = (value, label) => {
	const number = Number.parseFloat(String(value));
	if (!Number.isFinite(number) || number <= 0) {
		throw new Error(`${label} must be greater than 0.`);
	}
	return number;
};

export { parseOptionalPositiveInt, parsePositiveInt, parsePositiveFloat };
