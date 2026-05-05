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
 * Returns `{ viewerSummary, recommendation, ack, connected }` for the
 * UI to render diagnostics. The streamer-side panels are a separate
 * surface; this hook is only for the viewer page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";

import { MSG, ROLE, SOCKET_NAMESPACE, buildHello, buildViewerCapabilities, isProtocolCompatible } from "../../../shared/streaming/protocol.js";
import { attachHlsBandwidthListener, attachNetworkChangeListener, probeViewerCapabilities } from "./viewerProbe.js";

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
	const socketRef = useRef(null);
	const capabilitiesRef = useRef(null);
	const teardownsRef = useRef([]);

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
				socket.emit("control", buildHello({ role: ROLE.VIEWER, sessionId }));
				sendCapabilities("connect");
			});

			socket.on("disconnect", () => setConnected(false));

			socket.on("control", (envelope) => {
				if (!isProtocolCompatible(envelope)) return;
				if (envelope.type === MSG.VIEWER_SUMMARY || envelope.type === "viewer-summary-broadcast") {
					setViewerSummary(envelope.summary || envelope);
				}
				if (envelope.type === MSG.RECOMMENDED_SETTINGS) {
					setRecommendation(envelope);
				}
				if (envelope.type === "streamer-ack-broadcast") {
					setAck(envelope.ack || null);
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
			try {
				socketRef.current?.removeAllListeners();
				socketRef.current?.close();
			} catch (_err) {
				// socket already closed
			}
			socketRef.current = null;
			setConnected(false);
		};
	}, [enabled, sessionId, websiteBaseUrl, authToken, sendCapabilities, updateNetworkSlice]);

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
		}),
		[connected, viewerSummary, recommendation, ack]
	);
};

export { useLiveControlClient, deriveLiveControlOrigin };
