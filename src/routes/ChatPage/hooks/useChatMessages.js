import { useState, useCallback, useEffect, useRef } from "react";
import { fetchRoomMessages } from "../../../slices/chatApiSlice";

const MESSAGE_PAGE_SIZE = 50;
const SCROLL_TRIGGER_PX = 150;
const SKELETON_BATCH_SIZE = 10;

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

        const scrollToBottom = useCallback(() => {
                const el = listRef.current;
                if (!el) return;
                el.scrollTop = el.scrollHeight;
        }, []);

        useEffect(() => {
                requestAnimationFrame(scrollToBottom);
        }, [scrollToBottom]);

        const clampScrollIfLocked = useCallback((target) => {
                if (!target || scrollLockRef.current == null) return;
                if (target.scrollTop < scrollLockRef.current) {
                        target.scrollTop = scrollLockRef.current;
                }
        }, []);

	const isNearBottom = useCallback(() => {
		const el = listRef.current;
		if (!el) return false;
		return el.scrollHeight - el.clientHeight - el.scrollTop < SCROLL_TRIGGER_PX;
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
                                        scrollLockRef.current = listRef.current?.scrollTop ?? null;
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
                const previousScrollHeight = el?.scrollHeight ?? 0;
                const previousScrollTop = el?.scrollTop ?? 0;

                const applyScrollLock = () => {
                        if (!el) return;
                        const lockTarget = Math.max(el.scrollTop ?? 0, SCROLL_TRIGGER_PX);
                        scrollLockRef.current = lockTarget;
                        el.scrollTop = lockTarget;
                };

                applyScrollLock();

                if (hasMoreBefore) {
                        setLoadingSkeletonCount(SKELETON_BATCH_SIZE);
                        requestAnimationFrame(() => {
                                if (!listRef.current) return;
                                const newHeight = listRef.current.scrollHeight;
                                const adjustedTop = newHeight - previousScrollHeight + previousScrollTop;
                                listRef.current.scrollTop = adjustedTop;
                                scrollLockRef.current = adjustedTop;
                        });
                }

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
                                if (!listRef.current) return;
                                const newHeight = listRef.current.scrollHeight;
                                const adjustedTop = newHeight - previousScrollHeight + previousScrollTop;
                                listRef.current.scrollTop = adjustedTop;
                                scrollLockRef.current = adjustedTop;
                        });
                } catch (err) {
                        console.error("load older messages error", err);
                } finally {
                        fetchingRef.current = false;
                        loadingOlderRef.current = false;
                        setLoadingSkeletonCount(0);
                        inFlightBeforeRef.current = null;
                }
        }, [
                authState.authToken,
                authState.socketInfo.currentRoom,
                dispatch,
                mergeMessages,
                updatePageInfo,
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
                        const scrollTop = target.scrollTop ?? 0;

                        if (scrollTop < SCROLL_TRIGGER_PX && hasMoreBefore) {
                                scrollLockRef.current = Math.max(scrollTop, SCROLL_TRIGGER_PX);
                                target.scrollTop = scrollLockRef.current;
                                fetchOlderMessages();
                        }
                },
                [clampScrollIfLocked, fetchOlderMessages]
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
