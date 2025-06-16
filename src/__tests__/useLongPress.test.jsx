import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import useLongPress from "../helpers/useLongPress";

function TestComponent({ onLongPress }) {
	const handlers = useLongPress(onLongPress, 200);
	return (
		<div data-testid="press" {...handlers}>
			press me
		</div>
	);
}

describe("useLongPress hook", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("fires after long press", () => {
		const cb = vi.fn();
		render(<TestComponent onLongPress={cb} />);
		fireEvent.touchStart(screen.getByTestId("press"), {
			touches: [{ clientX: 0, clientY: 0 }],
		});
		vi.advanceTimersByTime(250);
		expect(cb).toHaveBeenCalled();
	});
});
