/**
 * React hook that owns the viewer-side `/live-control` Socket.IO
 * connection. It opens the connection when a sessionId is supplied,
 * runs the initial probe, sends `viewer-capabilities` on connect, and
 * thereafter feeds:
 *
 *   - `network change` events
 *   - hls.js `FRAG_LOADED` (every 10th fragment)
 *   - hls.js `LEVEL_SWITCHED` (immediately, especially on level drop)
 *
 * back as fresh `viewer-capabilities` updates with the appropriate
 * `triggeredBy` reason.
 *
 * Returns `{ viewerSummary, recommendation, ack, connected, adapting }`
 * for the UI to render diagnostics. `adapting` is non-null whenever
 * the server has just pushed a recommendation to the streamer and the
 * pipeline is expected to respawn — it lets the viewer surface
 * explain the upcoming rebuffer ("host is adjusting their stream for
 * you") instead of just spinning. The streamer-side panels are a
 * separate surface; this hook is only for the viewer page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";

import { ADAPTING_STATE, MSG, ROLE, SOCKET_NAMESPACE, buildViewerCapabilities, isProtocolCompatible } from "../../../shared/streaming/protocol.js";
import { attachHlsBandwidthListener, attachNetworkChangeListener, probeViewerCapabilities } from "./viewerProbe.js";

// Belt-and-braces against a server-side ack / timeout that never
// makes it to this client (websocket reconnect mid-window, etc.).
// Has to outlive the server's own 8s safety net so we don't clear
// before a slow `streamer-ack-broadcast` arrives.
const ADAPTING_CLIENT_SAFETY_MS = 12_000;

const deriveLiveControlOrigin = (websiteBaseUrl) => {
	if (!websiteBaseUrl) return "";
	try {
		const url = new URL(websiteBaseUrl);
		const hostname = url.hostname || "";
		const protocol = url.protocol === "https:" ? "https:" : "http:";
		if (url.port) {
			const websocketPort = Number(url.port) + 1;
			return `${protocol}//${hostname}:${websocketPort}`;
		}
		return `${protocol}//${url.host}`;
	} catch (_err) {
		return websiteBaseUrl;
	}
};

const DEV_DEFAULT_ORIGIN = "http://localhost:6002";
const PROD_DEFAULT_ORIGIN = "https://rebound.nexus";

const inferOrigin = ({ websiteBaseUrl }) => {
	if (websiteBaseUrl) return deriveLiveControlOrigin(websiteBaseUrl);
	if (typeof process !== "undefined" && process?.env?.NODE_ENV === "development") return DEV_DEFAULT_ORIGIN;
	if (typeof globalThis !== "undefined" && globalThis.IN_ELECTRON_ENV) return PROD_DEFAULT_ORIGIN;
	if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
	return PROD_DEFAULT_ORIGIN;
};

const useLiveControlClient = ({ sessionId, websiteBaseUrl, hls, authToken, enabled = true }) => {
	const [connected, setConnected] = useState(false);
	const [viewerSummary, setViewerSummary] = useState(null);
	const [recommendation, setRecommendation] = useState(null);
	const [ack, setAck] = useState(null);
	const [adapting, setAdapting] = useState(null);
	const socketRef = useRef(null);
	const capabilitiesRef = useRef(null);
	const teardownsRef = useRef([]);
	const adaptingTimerRef = useRef(null);

	const clearAdaptingTimer = useCallback(() => {
		if (!adaptingTimerRef.current) return;
		clearTimeout(adaptingTimerRef.current);
		adaptingTimerRef.current = null;
	}, []);

	const armAdaptingTimer = useCallback(() => {
		clearAdaptingTimer();
		adaptingTimerRef.current = setTimeout(() => {
			adaptingTimerRef.current = null;
			setAdapting(null);
		}, ADAPTING_CLIENT_SAFETY_MS);
	}, [clearAdaptingTimer]);

	const sendCapabilities = useCallback((triggeredBy) => {
		const socket = socketRef.current;
		const capabilities = capabilitiesRef.current;
		if (!socket || !socket.connected || !capabilities) return;
		socket.emit(
			"control",
			buildViewerCapabilities({
				...capabilities,
				triggeredBy: triggeredBy || "connect",
			})
		);
	}, []);

	const updateNetworkSlice = useCallback(
		(patch, triggeredBy) => {
			const capabilities = capabilitiesRef.current;
			if (!capabilities) return;
			capabilitiesRef.current = {
				...capabilities,
				network: { ...capabilities.network, ...patch },
				probedAt: Date.now(),
			};
			sendCapabilities(triggeredBy);
		},
		[sendCapabilities]
	);

	useEffect(() => {
		if (!enabled || !sessionId) return undefined;

		let cancelled = false;
		const origin = inferOrigin({ websiteBaseUrl });

		(async () => {
			try {
				capabilitiesRef.current = await probeViewerCapabilities();
			} catch (err) {
				console.warn("viewerProbe failed", err);
				return;
			}
			if (cancelled) return;

			const socket = ioClient(`${origin}${SOCKET_NAMESPACE}`, {
				path: "/socket.io",
				transports: ["websocket"],
				withCredentials: true,
				reconnection: true,
				auth: {
					role: ROLE.VIEWER,
					sessionId,
					...(authToken ? { token: authToken } : {}),
				},
			});

			socketRef.current = socket;

			socket.on("connect", () => {
				if (cancelled) return;
				setConnected(true);
				// The server emits its own HELLO from the `connection`
				// handler (carrying any cached `summary` + the in-flight
				// `adapting` snapshot), so the viewer never needs to
				// announce itself with a HELLO of its own. Capabilities
				// are what the server actually wants to ingest after
				// auth — emit those immediately and let the next
				// recompute fan a summary back.
				sendCapabilities("connect");
			});

			socket.on("disconnect", () => {
				setConnected(false);
				// Connection dropped — we cannot trust any in-flight
				// adapting state because the server may have cleared it
				// while we were offline. Drop locally; if the streamer
				// is still mid-respawn, the next push will repopulate.
				clearAdaptingTimer();
				setAdapting(null);
			});

			socket.on("control", (envelope) => {
				if (!isProtocolCompatible(envelope)) return;
				if (envelope.type === MSG.VIEWER_SUMMARY || envelope.type === MSG.VIEWER_SUMMARY_BROADCAST) {
					setViewerSummary(envelope.summary || envelope);
				}
				if (envelope.type === MSG.RECOMMENDED_SETTINGS) {
					setRecommendation(envelope);
				}
				if (envelope.type === MSG.STREAMER_ACK_BROADCAST) {
					setAck(envelope.ack || null);
					clearAdaptingTimer();
					setAdapting(null);
				}
				if (envelope.type === MSG.HELLO && envelope.adapting) {
					// Late join into an in-flight adaptation: hydrate
					// immediately so the UI doesn't blink "fine" → "host
					// adjusting" → "fine" once the next push arrives.
					setAdapting(envelope.adapting);
					armAdaptingTimer();
				}
				if (envelope.type === MSG.STREAMER_ADAPTING_BROADCAST) {
					if (envelope.state === ADAPTING_STATE.PENDING) {
						setAdapting({
							state: ADAPTING_STATE.PENDING,
							sessionId: envelope.sessionId,
							target: envelope.target || null,
							reason: envelope.reason || "",
							direction: envelope.direction || "same",
							derivedFromViewerCount: envelope.derivedFromViewerCount ?? null,
							generation: envelope.generation ?? null,
							since: envelope.since ?? Date.now(),
						});
						armAdaptingTimer();
					} else if (envelope.state === ADAPTING_STATE.CLEARED) {
						clearAdaptingTimer();
						setAdapting(null);
					}
				}
			});

			const detachNetwork = attachNetworkChangeListener({
				onUpdate: (network) => updateNetworkSlice(network, "network_change"),
			});
			teardownsRef.current.push(detachNetwork);
		})();

		return () => {
			cancelled = true;
			for (const teardown of teardownsRef.current) {
				try {
					teardown();
				} catch (_err) {
					// teardown already ran
				}
			}
			teardownsRef.current = [];
			clearAdaptingTimer();
			try {
				socketRef.current?.removeAllListeners();
				socketRef.current?.close();
			} catch (_err) {
				// socket already closed
			}
			socketRef.current = null;
			setConnected(false);
			setAdapting(null);
		};
	}, [enabled, sessionId, websiteBaseUrl, authToken, sendCapabilities, updateNetworkSlice, armAdaptingTimer, clearAdaptingTimer]);

	useEffect(() => {
		if (!enabled || !hls) return undefined;
		const detach = attachHlsBandwidthListener({
			hls,
			onUpdate: (patch) => {
				updateNetworkSlice(
					{
						hlsBandwidthEstimateMbit: patch.hlsBandwidthEstimateMbit,
						currentHlsLevel: patch.currentHlsLevel,
					},
					patch.triggeredBy
				);
			},
		});
		teardownsRef.current.push(detach);
		return detach;
	}, [enabled, hls, updateNetworkSlice]);

	return useMemo(
		() => ({
			connected,
			viewerSummary,
			recommendation,
			ack,
			adapting,
		}),
		[connected, viewerSummary, recommendation, ack, adapting]
	);
};

export { useLiveControlClient, deriveLiveControlOrigin };
