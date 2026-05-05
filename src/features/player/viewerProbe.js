/**
 * Viewer-side capability probe used by the live player.
 *
 * Returns a {@link import("../../../shared/streaming/types.js").ViewerCapabilities}
 * describing what this browser can decode, how fat its pipe is, and what
 * size of viewport it intends to render in. The result is sent up the
 * `/live-control` channel so the server can aggregate viewers and the
 * streamer can clamp its FFmpeg pipeline appropriately.
 *
 * The probe is intentionally three-tiered for codec detection so it
 * degrades gracefully across browsers:
 *
 *   Tier 1: `MediaSource.isTypeSupported` — synchronous, very broad
 *           browser coverage. Tells us "the demuxer/decoder pair will
 *           almost certainly initialize" but says nothing about
 *           hardware acceleration.
 *
 *   Tier 2: `navigator.mediaCapabilities.decodingInfo` — async, returns
 *           `smooth` + `powerEfficient`. Lets us know whether decode is
 *           hardware-accelerated for a representative configuration. We
 *           probe each Tier-1-supported codec individually, so a battery-
 *           powered laptop with no HEVC HW decode reports `smooth=false`
 *           and the recommender can demote.
 *
 *   Tier 3: `HTMLVideoElement.canPlayType` — legacy fallback only used
 *           when `MediaSource` is undefined (very old browsers).
 *
 * Network and display probes are intentionally synchronous — they're
 * cheap reads from `navigator.connection` and `window.screen`. The HLS
 * bandwidth estimate is filled in lazily by `attachHlsBandwidthListener`
 * after hls.js has loaded a few segments because that signal is far more
 * reliable than `navigator.connection.downlink`, which on most desktop
 * browsers reports a fixed value of 10 Mbit/s.
 */

const HEVC_HDR_PROBE = "hev1.2.4.L120.B0";

const CODEC_PROBES = Object.freeze({
	h264_baseline: 'video/mp4; codecs="avc1.42E01E"',
	h264_main: 'video/mp4; codecs="avc1.4D401F"',
	h264_high: 'video/mp4; codecs="avc1.640028"',
	hevc_main: 'video/mp4; codecs="hev1.1.6.L93.B0"',
	hevc_main10: `video/mp4; codecs="${HEVC_HDR_PROBE}"`,
	av1: 'video/mp4; codecs="av01.0.08M.08"',
	vp9: 'video/webm; codecs="vp9"',
	aac_lc: 'audio/mp4; codecs="mp4a.40.2"',
	opus: 'audio/webm; codecs="opus"',
});

const SAMPLE_DECODING_CONFIG = Object.freeze({
	type: "media-source",
	video: {
		contentType: 'video/mp4; codecs="avc1.640028"',
		width: 1280,
		height: 720,
		bitrate: 4_000_000,
		framerate: 30,
	},
});

const isSupportedTier1 = (mime) => {
	if (typeof window === "undefined" || typeof window.MediaSource === "undefined") return false;
	try {
		return Boolean(window.MediaSource.isTypeSupported(mime));
	} catch (_err) {
		return false;
	}
};

const probeWithMediaCapabilities = async (mime) => {
	if (typeof navigator === "undefined" || !navigator.mediaCapabilities?.decodingInfo) {
		return { smooth: null, powerEfficient: null };
	}

	const isAudio = mime.startsWith("audio/");
	const config = isAudio
		? { type: "media-source", audio: { contentType: mime } }
		: { ...SAMPLE_DECODING_CONFIG, video: { ...SAMPLE_DECODING_CONFIG.video, contentType: mime } };

	try {
		const result = await navigator.mediaCapabilities.decodingInfo(config);
		return {
			smooth: typeof result.smooth === "boolean" ? result.smooth : null,
			powerEfficient: typeof result.powerEfficient === "boolean" ? result.powerEfficient : null,
		};
	} catch (_err) {
		return { smooth: null, powerEfficient: null };
	}
};

const fallbackCanPlayType = (mime) => {
	if (typeof document === "undefined") return false;
	const probe = document.createElement("video");
	const result = probe.canPlayType(mime);
	return result === "probably" || result === "maybe";
};

const probeCodecs = async () => {
	const entries = await Promise.all(
		Object.entries(CODEC_PROBES).map(async ([key, mime]) => {
			let supported = isSupportedTier1(mime);
			if (!supported && typeof window !== "undefined" && typeof window.MediaSource === "undefined") {
				supported = fallbackCanPlayType(mime);
			}
			if (!supported) {
				return [key, { supported: false, smooth: null, powerEfficient: null }];
			}
			const { smooth, powerEfficient } = await probeWithMediaCapabilities(mime);
			return [key, { supported: true, smooth, powerEfficient }];
		})
	);

	return Object.fromEntries(entries);
};

const probeNetwork = () => {
	if (typeof navigator === "undefined") {
		return { downlinkMbit: null, effectiveType: null, rttMs: null, saveData: false, hlsBandwidthEstimateMbit: null, currentHlsLevel: null };
	}

	const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;

	return {
		downlinkMbit: typeof connection?.downlink === "number" ? connection.downlink : null,
		effectiveType: typeof connection?.effectiveType === "string" ? connection.effectiveType : null,
		rttMs: typeof connection?.rtt === "number" ? connection.rtt : null,
		saveData: Boolean(connection?.saveData),
		hlsBandwidthEstimateMbit: null,
		currentHlsLevel: null,
	};
};

const probeDisplay = () => {
	if (typeof window === "undefined") {
		return { viewportWidth: 0, viewportHeight: 0, screenWidth: 0, screenHeight: 0, devicePixelRatio: 1 };
	}

	return {
		viewportWidth: window.innerWidth || 0,
		viewportHeight: window.innerHeight || 0,
		screenWidth: window.screen?.width || 0,
		screenHeight: window.screen?.height || 0,
		devicePixelRatio: window.devicePixelRatio || 1,
	};
};

const deriveCodecFamilies = (codecs) => {
	const families = new Set();
	if (!codecs) return [];
	const isAnyTrue = (...keys) => keys.some((key) => codecs[key]?.supported);

	if (isAnyTrue("h264_baseline", "h264_main", "h264_high")) families.add("h264");
	if (isAnyTrue("hevc_main", "hevc_main10")) families.add("hevc");
	if (codecs.av1?.supported) families.add("av1");
	if (codecs.vp9?.supported) families.add("vp9");
	return [...families];
};

const newViewerId = () => {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `viewer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const probeViewerCapabilities = async ({ viewerId } = {}) => {
	const codecs = await probeCodecs();
	return {
		viewerId: viewerId || newViewerId(),
		codecs,
		supportedCodecFamilies: deriveCodecFamilies(codecs),
		network: probeNetwork(),
		display: probeDisplay(),
		userAgent: typeof navigator !== "undefined" ? navigator.userAgent || "" : "",
		probedAt: Date.now(),
	};
};

/**
 * Subscribe to hls.js events and feed the bandwidth signal back to the
 * caller. We deliberately throttle:
 *
 *   - `FRAG_LOADED`: refresh on every 10th fragment AND only when the
 *     estimate moves by >15%. Fragment-by-fragment chatter would cost
 *     bandwidth without changing the recommendation.
 *   - `LEVEL_SWITCHED`: forward immediately. A level drop is a strong
 *     signal that this viewer is in trouble; the server should hear
 *     about it on the same RTT, not 10 segments later.
 *
 * Returns a teardown function so the caller can unhook on player
 * destruction.
 *
 * @param {{
 *   hls: any,
 *   onUpdate: (patch: { hlsBandwidthEstimateMbit: number | null,
 *                       currentHlsLevel: number | null,
 *                       triggeredBy: string }) => void,
 * }} options
 * @returns {() => void}
 */
const attachHlsBandwidthListener = ({ hls, onUpdate }) => {
	if (!hls || typeof hls.on !== "function") return () => {};
	if (typeof onUpdate !== "function") return () => {};

	let fragmentsSeen = 0;
	let lastReportedMbit = null;
	let lastReportedLevel = null;

	const readBandwidthMbit = () => {
		const estimate = Number(hls.bandwidthEstimate);
		if (!Number.isFinite(estimate) || estimate <= 0) return null;
		return estimate / 1_000_000;
	};

	const significantlyDifferent = (next) => {
		if (lastReportedMbit == null) return next != null;
		if (next == null) return true;
		return Math.abs(next - lastReportedMbit) / lastReportedMbit > 0.15;
	};

	const onFragLoaded = () => {
		fragmentsSeen += 1;
		if (fragmentsSeen % 10 !== 0) return;
		const next = readBandwidthMbit();
		if (!significantlyDifferent(next)) return;
		lastReportedMbit = next;
		onUpdate({
			hlsBandwidthEstimateMbit: next,
			currentHlsLevel: lastReportedLevel,
			triggeredBy: "hls_bandwidth",
		});
	};

	const onLevelSwitched = (_event, payload) => {
		const level = Number(payload?.level);
		const nextLevel = Number.isFinite(level) ? level : null;
		const previousLevel = lastReportedLevel;
		lastReportedLevel = nextLevel;
		const next = readBandwidthMbit();
		lastReportedMbit = next;
		const droppedDown = previousLevel != null && nextLevel != null && nextLevel < previousLevel;
		onUpdate({
			hlsBandwidthEstimateMbit: next,
			currentHlsLevel: nextLevel,
			triggeredBy: droppedDown ? "hls_level_drop" : "hls_bandwidth",
		});
	};

	const Events = hls.constructor?.Events || {};
	const fragLoadedEvent = Events.FRAG_LOADED || "hlsFragLoaded";
	const levelSwitchedEvent = Events.LEVEL_SWITCHED || "hlsLevelSwitched";

	hls.on(fragLoadedEvent, onFragLoaded);
	hls.on(levelSwitchedEvent, onLevelSwitched);

	return () => {
		try {
			hls.off?.(fragLoadedEvent, onFragLoaded);
			hls.off?.(levelSwitchedEvent, onLevelSwitched);
		} catch (_err) {
			// hls already destroyed
		}
	};
};

/**
 * Watch `navigator.connection` for `change` events and re-probe the
 * network slice of `ViewerCapabilities`. Returns a teardown function.
 *
 * @param {{ onUpdate: (network: ReturnType<typeof probeNetwork>) => void }} options
 * @returns {() => void}
 */
const attachNetworkChangeListener = ({ onUpdate }) => {
	if (typeof navigator === "undefined" || typeof onUpdate !== "function") return () => {};
	const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
	if (!connection || typeof connection.addEventListener !== "function") return () => {};

	let lastSnapshot = probeNetwork();
	const handleChange = () => {
		const next = probeNetwork();
		if (next.downlinkMbit === lastSnapshot.downlinkMbit && next.effectiveType === lastSnapshot.effectiveType && next.saveData === lastSnapshot.saveData) {
			return;
		}
		lastSnapshot = next;
		onUpdate(next);
	};
	connection.addEventListener("change", handleChange);
	return () => {
		try {
			connection.removeEventListener("change", handleChange);
		} catch (_err) {
			// listener already detached
		}
	};
};

export {
	CODEC_PROBES,
	probeViewerCapabilities,
	probeCodecs,
	probeNetwork,
	probeDisplay,
	deriveCodecFamilies,
	attachHlsBandwidthListener,
	attachNetworkChangeListener,
	newViewerId,
};
