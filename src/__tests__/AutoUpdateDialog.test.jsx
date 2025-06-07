import { render, screen, act } from "@testing-library/react";
import { vi, describe, expect, beforeEach, afterEach, test } from "vitest";
import AutoUpdate from "../components/AutoUpdate.jsx";

describe("Auto update dialog", () => {
	let originalAPI;
	let handlers;

	beforeEach(() => {
		handlers = {};
		originalAPI = window.electronAPI;
		window.electronAPI = {
			onChecking: (cb) => (handlers.checking = cb),
			onUpdateAvailable: (cb) => (handlers.updateAvailable = cb),
			onUpdateNotAvailable: (cb) => (handlers.notAvailable = cb),
			onDownloadProgress: (cb) => (handlers.progress = cb),
			onUpdateDownloaded: (cb) => (handlers.downloaded = cb),
			onUpdateError: (cb) => (handlers.error = cb),
			checkForUpdates: vi.fn(),
			installUpdate: vi.fn(),
			downloadUpdate: vi.fn(),
		};
	});

	afterEach(() => {
		window.electronAPI = originalAPI;
	});

	test("prompts the user when an update is available", () => {
		render(<AutoUpdate />);
		expect(window.electronAPI.checkForUpdates).toHaveBeenCalled();

		act(() => {
			handlers.updateAvailable();
		});

		expect(screen.getByText(/Update Available/i)).toBeInTheDocument();
	});
});
