import { useCallback, useEffect, useRef, useState } from "react";

const nonEmptyOverrides = (settings) => Object.fromEntries(Object.entries(settings || {}).filter(([_key, value]) => value !== ""));

const useStreamSettings = ({ electronLive, initialSettings, saveDelayMs = 1000 }) => {
	const [settings, setSettings] = useState(initialSettings);
	const [hydrated, setHydrated] = useState(false);
	const saveSettingsTimeoutRef = useRef(null);

	useEffect(() => {
		if (!electronLive?.loadSettings) {
			setHydrated(true);
			return undefined;
		}

		let cancelled = false;
		setHydrated(false);
		electronLive
			.loadSettings()
			.then((saved) => {
				if (cancelled || !saved || typeof saved !== "object") return;
				setSettings((current) => ({
					...current,
					...nonEmptyOverrides(saved),
				}));
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setHydrated(true);
			});

		return () => {
			cancelled = true;
		};
	}, [electronLive]);

	useEffect(() => {
		if (!electronLive?.saveSettings || !hydrated) return undefined;
		if (saveSettingsTimeoutRef.current) {
			clearTimeout(saveSettingsTimeoutRef.current);
		}

		saveSettingsTimeoutRef.current = setTimeout(() => {
			electronLive.saveSettings(settings).catch(() => {});
		}, saveDelayMs);

		return () => {
			if (saveSettingsTimeoutRef.current) {
				clearTimeout(saveSettingsTimeoutRef.current);
			}
		};
	}, [electronLive, hydrated, saveDelayMs, settings]);

	const resetSettings = useCallback(async () => {
		if (!electronLive?.resetSettings) return null;
		const next = await electronLive.resetSettings();
		setSettings((current) => ({
			...current,
			...nonEmptyOverrides(next),
		}));
		return next;
	}, [electronLive]);

	return {
		settings,
		setSettings,
		hydrated,
		resetSettings,
	};
};

export { useStreamSettings };
