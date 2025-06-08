import { renderHook, act } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import useWindowDimensions from "../helpers/useWindowDimensions.js";

// helper to override window dimensions
function setWindowSize(width, height) {
	Object.defineProperty(window, "innerWidth", {
		writable: true,
		configurable: true,
		value: width,
	});
	Object.defineProperty(window, "innerHeight", {
		writable: true,
		configurable: true,
		value: height,
	});
}

describe("useWindowDimensions hook", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("returns current window size", () => {
		setWindowSize(800, 600);
		const { result } = renderHook(() => useWindowDimensions());
		expect(result.current).toEqual({ width: 800, height: 600 });
	});

	test("updates when window is resized", () => {
		setWindowSize(800, 600);
		const { result } = renderHook(() => useWindowDimensions());

		act(() => {
			setWindowSize(1024, 768);
			window.dispatchEvent(new Event("resize"));
			vi.advanceTimersByTime(150);
		});

		expect(result.current).toEqual({ width: 1024, height: 768 });
	});
});
