/**
 * Pure numeric parsers used during config normalization.
 */

/**
 * Multiplier applied to the configured output `fps` to produce a hard
 * ceiling on the source's emission rate. Capture backends (gfxcapture,
 * gdigrab, avfoundation, x11grab) all run at most this fast regardless
 * of what the user set `captureFps` to. The 15 % headroom absorbs the
 * natural jitter from real-time desktop capture without letting a
 * runaway source push the encoder past the configured target rate.
 */
const RECORDING_FPS_CEILING_RATIO = 1.15;

/**
 * Compute the rate we actually want the capture source to run at.
 *
 *  - If `fps` is unset, fall back to the user-configured `captureFps`.
 *  - Otherwise, cap `captureFps` at `ceil(fps * RECORDING_FPS_CEILING_RATIO)`.
 *
 * Capping from above (`Math.min`) means the helper never speeds the
 * source up: if a user explicitly chose a `captureFps` below that
 * ceiling (e.g. capturing at 30 fps to feed a 60 fps output), their
 * choice is honored.
 *
 * @param {{ captureFps: number, fps: number | null }} config
 * @returns {number}
 */
const effectiveCaptureFps = (config) => {
	const captureFps = config.captureFps;
	const target = config.fps;
	if (!target || !captureFps) return captureFps;
	const ceiling = Math.ceil(target * RECORDING_FPS_CEILING_RATIO);
	return Math.min(captureFps, ceiling);
};

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

export { RECORDING_FPS_CEILING_RATIO, effectiveCaptureFps, parseOptionalPositiveInt, parsePositiveInt, parsePositiveFloat };
