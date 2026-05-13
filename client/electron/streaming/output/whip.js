/**
 * Pure WHIP output argv builder.
 *
 * FFmpeg's WHIP muxer is still capability-gated by the bundled FFmpeg build,
 * so callers should probe before selecting this output. This module only
 * composes the output tail once a WHIP endpoint is already known.
 *
 * @typedef {import("../types.js").StreamConfig} StreamConfig
 */

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;

const optionalString = (value) => (typeof value === "string" && value.trim() ? value.trim() : "");

/**
 * @param {StreamConfig} config
 * @param {{
 *   endpoint?: string,
 *   authorization?: string,
 *   handshakeTimeoutMs?: number,
 *   pktSize?: number,
 *   whipFlags?: string[],
 * }} [options]
 * @returns {string[]}
 */
const buildArgs = (config, options = {}) => {
	const endpoint = optionalString(options.endpoint) || optionalString(config.whipEndpoint);
	if (!endpoint) {
		throw new TypeError("WHIP output requires a whipEndpoint config value or endpoint option.");
	}

	const authorization = optionalString(options.authorization) || optionalString(config.whipAuthorization) || optionalString(config.whipToken);
	const handshakeTimeoutMs = Number.isInteger(options.handshakeTimeoutMs)
		? options.handshakeTimeoutMs
		: Number.isInteger(config.whipHandshakeTimeoutMs)
			? config.whipHandshakeTimeoutMs
			: DEFAULT_HANDSHAKE_TIMEOUT_MS;
	const pktSize = Number.isInteger(options.pktSize) ? options.pktSize : Number.isInteger(config.whipPacketSize) ? config.whipPacketSize : null;
	const whipFlags = Array.isArray(options.whipFlags) ? options.whipFlags : Array.isArray(config.whipFlags) ? config.whipFlags : [];

	const args = ["-strict", "experimental", "-f", "whip", "-handshake_timeout", String(handshakeTimeoutMs)];

	if (authorization) {
		args.push("-authorization", authorization);
	}

	if (pktSize && pktSize > 0) {
		args.push("-pkt_size", String(pktSize));
	}

	if (whipFlags.length) {
		args.push("-whip_flags", whipFlags.join("+"));
	}

	args.push(endpoint);
	return args;
};

export { buildArgs };
