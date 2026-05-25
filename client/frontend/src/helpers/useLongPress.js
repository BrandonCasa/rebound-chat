import { useCallback, useRef } from "react";

export default function useLongPress(callback, ms = 500) {
	const timerRef = useRef(null);

	const start = useCallback(
		(event) => {
			const { clientX, clientY } = event.touches && event.touches[0] ? event.touches[0] : event;
			timerRef.current = setTimeout(() => {
				callback({ x: clientX, y: clientY });
			}, ms);
		},
		[callback, ms]
	);

	const clear = useCallback(() => {
		clearTimeout(timerRef.current);
	}, []);

	return {
		onMouseDown: start,
		onMouseUp: clear,
		onMouseLeave: clear,
		onTouchStart: start,
		onTouchEnd: clear,
		onTouchMove: clear,
	};
}
