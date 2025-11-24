import { useState, useCallback, useEffect, useRef } from "react";
import { fetchRoomMessages } from "../../../slices/chatApiSlice";

const MESSAGE_PAGE_SIZE = 50;
const SCROLL_TRIGGER_PX = 150;
const SKELETON_BATCH_SIZE = 10;

const getMaxScrollTop = (el) => {
        if (!el) return 0;
        return Math.max((el.scrollHeight ?? 0) - (el.clientHeight ?? 0), 0);
};

const clampScrollTop = (el, desiredTop) => {
        if (!el) return 0;
        return Math.max(0, Math.min(desiredTop, getMaxScrollTop(el)));
};

export default function useChatMessages(authState, dispatch) {
        const [messages, setMessages] = useState([]);
        const [loadingSkeletonCount, setLoadingSkeletonCount] = useState(0);
        const listRef = useRef(null);
        const fetchingRef = useRef(false);
        const pageInfoRef = useRef({
                hasMoreBefore: false,
                hasMoreAfter: false,
                nextBefore: null,
                nextAfter: null,
        });
        const loadingOlderRef = useRef(false);
        const initialFetchRoomRef = useRef(null);
        const scrollLockRef = useRef(null);
        const inFlightBeforeRef = useRef(null);

	const mergeMessages = useCallback((existing, incoming) => {
		const merged = new Map();
		existing.forEach((msg) => merged.set(msg._id, msg));
		incoming.forEach((msg) => merged.set(msg._id, msg));

		return Array.from(merged.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
	}, []);

	const updatePageInfo = useCallback((pageInfo = {}, nextMessages = []) => {
		pageInfoRef.current = {
			hasMoreBefore: pageInfo.hasMoreBefore ?? pageInfoRef.current.hasMoreBefore,
			hasMoreAfter: pageInfo.hasMoreAfter ?? pageInfoRef.current.hasMoreAfter,
			nextBefore: pageInfo.nextBefore ?? (nextMessages[0] && nextMessages[0]._id) ?? pageInfoRef.current.nextBefore,
			nextAfter: pageInfo.nextAfter ?? (nextMessages[nextMessages.length - 1] && nextMessages[nextMessages.length - 1]._id) ?? pageInfoRef.current.nextAfter,
		};
	}, []);

        const setScrollTop = useCallback((desiredTop, { lock = false, frame = false } = {}) => {
                const el = listRef.current;
                if (!el) return null;

                const apply = () => {
                        const clampedTop = clampScrollTop(el, desiredTop);
                        el.scrollTop = clampedTop;
                        if (lock) {
                                scrollLockRef.current = clampedTop;
                        }
                        return clampedTop;
                };

                if (frame) {
                        requestAnimationFrame(apply);
                        return null;
                }

                return apply();
        }, []);

        const scrollToBottom = useCallback(() => {
                const el = listRef.current;
                if (!el) return;
                setScrollTop(getMaxScrollTop(el), { frame: true });
        }, [setScrollTop]);

        useEffect(() => {
                scrollToBottom();
        }, [scrollToBottom]);

        const clampScrollIfLocked = useCallback(
                (target) => {
                        if (!target || scrollLockRef.current == null) return;
                        setScrollTop(scrollLockRef.current, { lock: true });
                },
                [setScrollTop]
        );

        const isNearBottom = useCallback(() => {
                const el = listRef.current;
                if (!el) return false;
                const bottomGap = getMaxScrollTop(el) - (el.scrollTop ?? 0);
                return bottomGap < SCROLL_TRIGGER_PX;
        }, []);

        const fetchMessages = useCallback(
                async (roomOverride) => {
                        const roomId = roomOverride || authState.socketInfo.currentRoom;
                        if (!roomId || fetchingRef.current || !authState.authToken) return;

                        fetchingRef.current = true;
                        try {
                                const { messages: msgs, pageInfo } = await dispatch(
                                        fetchRoomMessages({
                                                roomId,
                                                authToken: authState.authToken,
                                                limit: MESSAGE_PAGE_SIZE,
                                        })
                                ).unwrap();

                                const mapped = msgs || [];
                                setMessages(mapped);
                                updatePageInfo(pageInfo, mapped);
                                requestAnimationFrame(() => {
                                        scrollToBottom();
                                        const el = listRef.current;
                                        scrollLockRef.current = el ? clampScrollTop(el, el.scrollTop ?? 0) : null;
                                });
                        } catch (err) {
                                console.error("load messages error", err);
                        } finally {
                                fetchingRef.current = false;
                                inFlightBeforeRef.current = null;
                        }
                },
                [authState.authToken, authState.socketInfo.currentRoom, dispatch, scrollToBottom, updatePageInfo]
        );

        const fetchOlderMessages = useCallback(async () => {
                const { currentRoom } = authState.socketInfo;
                const { hasMoreBefore, nextBefore } = pageInfoRef.current;

                if (!currentRoom || fetchingRef.current || !hasMoreBefore || !nextBefore) {
                        return;
                }

                if (inFlightBeforeRef.current === nextBefore) return;
                inFlightBeforeRef.current = nextBefore;

                fetchingRef.current = true;
                loadingOlderRef.current = true;

                const el = listRef.current;
                const lockedTop = clampScrollTop(el, el?.scrollTop ?? 0);
                const bottomGap = el ? getMaxScrollTop(el) - lockedTop : 0;
                scrollLockRef.current = lockedTop;
                setScrollTop(Math.max(lockedTop, SCROLL_TRIGGER_PX), { lock: true });

                const restorePosition = () => {
                        const container = listRef.current;
                        if (!container) return;
                        const targetTop = clampScrollTop(container, getMaxScrollTop(container) - bottomGap);
                        setScrollTop(targetTop, { lock: true });
                };

                setLoadingSkeletonCount(SKELETON_BATCH_SIZE);
                requestAnimationFrame(restorePosition);

                try {
                        const { messages: olderMessages, pageInfo } = await dispatch(
                                fetchRoomMessages({
                                        roomId: currentRoom,
                                        authToken: authState.authToken,
                                        before: nextBefore,
                                        limit: MESSAGE_PAGE_SIZE,
                                })
                        ).unwrap();

                        const mapped = olderMessages || [];
                        setMessages((prev) => {
                                const merged = mergeMessages(mapped, prev);
                                updatePageInfo(pageInfo, merged);
                                return merged;
                        });

                        requestAnimationFrame(() => {
                                restorePosition();
                        });
                } catch (err) {
                        console.error("load older messages error", err);
                } finally {
                        fetchingRef.current = false;
                        loadingOlderRef.current = false;
                        setLoadingSkeletonCount(0);
                        inFlightBeforeRef.current = null;
                        scrollLockRef.current = null;
                }
        }, [
                authState.authToken,
                authState.socketInfo.currentRoom,
                dispatch,
                mergeMessages,
                updatePageInfo,
                setScrollTop,
        ]);

	// Now only called on scrollend, so we just check where the scroll finished.
        const handleScroll = useCallback(
                (e) => {
                        const target = e.target;
                        if (!target) return;

                        if (loadingOlderRef.current || fetchingRef.current) {
                                clampScrollIfLocked(target);
                                return;
                        }

                        const { hasMoreBefore } = pageInfoRef.current;
                        const scrollTop = clampScrollTop(target, target.scrollTop ?? 0);

                        if (scrollTop < SCROLL_TRIGGER_PX && hasMoreBefore) {
                                const lockTarget = Math.max(scrollTop, SCROLL_TRIGGER_PX);
                                setScrollTop(lockTarget, { lock: true });
                                fetchOlderMessages();
                        }
                },
                [clampScrollIfLocked, fetchOlderMessages, setScrollTop]
        );

        const resetRoomState = useCallback(() => {
                pageInfoRef.current = {
                        hasMoreBefore: false,
                        hasMoreAfter: false,
                        nextBefore: null,
                        nextAfter: null,
                };
                loadingOlderRef.current = false;
                fetchingRef.current = false;
                scrollLockRef.current = null;
                inFlightBeforeRef.current = null;
                setLoadingSkeletonCount(0);
        }, []);

        return {
                messages,
                setMessages,
                listRef,
                handleScroll,
                fetchMessages,
                mergeMessages,
                updatePageInfo,
                scrollToBottom,
                isNearBottom,
                pageInfoRef,
                fetchingRef,
                loadingOlderRef,
                resetRoomState,
                initialFetchRoomRef,
                loadingSkeletonCount,
        };
}
