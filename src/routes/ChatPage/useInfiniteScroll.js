import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { useInView } from "react-intersection-observer";

export default function useInfiniteScrollUpList(options = {}, fetchOlderMessages, messages, pageInfoRef) {
	const { initialCount = 20, chunkSize = 10, debounceMs = 500 } = options;

	const [isLoading, setIsLoading] = useState(false);
	const [isDone, setIsDone] = useState(true);

	const listNodeRef = useRef(null);
	const [rootEl, setRootEl] = useState(null);
	const prevScrollHeightRef = useRef(0);
	const debounceTimeoutRef = useRef(null);

	// Attach list and use it as the root for IntersectionObserver
	const setListRef = useCallback((node) => {
		listNodeRef.current = node;
		if (node) setRootEl(node);
	}, []);

	const { ref: topSentinelRef, inView } = useInView({
		threshold: 0,
		root: rootEl || null,
	});

	const loadMoreItems = useCallback(async () => {
		if (isLoading) return;

		const list = listNodeRef.current;
		if (!list) return;

		// remember previous scrollHeight so we can keep visual position
		prevScrollHeightRef.current = list.scrollHeight;

		setIsLoading(true);

		return await fetchOlderMessages();
	}, [isLoading]);

	// Debounced trigger when top sentinel is in view
	useEffect(() => {
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
			debounceTimeoutRef.current = null;
		}

		if (inView && !isLoading && (pageInfoRef?.current?.hasMoreBefore == null || pageInfoRef.current.hasMoreBefore)) {
			debounceTimeoutRef.current = setTimeout(async () => {
				setIsDone(false);
				const isDone = await loadMoreItems();
				setIsDone(true);
			}, debounceMs);
		}

		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
				debounceTimeoutRef.current = null;
			}
		};
	}, [inView, isLoading, loadMoreItems, debounceMs]);

	// After messages change while loading, fix scroll position so it doesn’t jump
	useLayoutEffect(() => {
		if (!isLoading) return;
		if (!isDone) return;

		const list = listNodeRef.current;
		if (!list) return;

		const newScrollHeight = list.scrollHeight;
		const diff = newScrollHeight - prevScrollHeightRef.current;

		requestAnimationFrame(() => {
			listNodeRef.current.scrollTop = list.scrollTop + diff;
		});

		setIsLoading(false);
	}, [messages.map((a) => a._id), isLoading, isDone]);

	return {
		listRef: setListRef,
		topSentinelRef,
		isLoading,
	};
}
