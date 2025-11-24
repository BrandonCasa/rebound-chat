import { useState, useCallback, useRef } from "react";
import { fetchRoomMessages } from "../../../slices/chatApiSlice";

const MESSAGE_PAGE_SIZE = 50;
const SCROLL_TRIGGER_PX = 150;

export default function useChatMessages(authState, dispatch) {
        const [messages, setMessages] = useState([]);
        const listRef = useRef(null);
        const fetchingRef = useRef(false);
        const pageInfoRef = useRef({ hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null });
        const loadingOlderRef = useRef(false);
        const initialFetchRoomRef = useRef(null);
        const topFetchLockedRef = useRef(false);
        const rearmScrollTopRef = useRef(SCROLL_TRIGGER_PX * 2);
        const lastScrollTopRef = useRef(0);

        const mergeMessages = useCallback((existing, incoming) => {
                const merged = new Map();
                existing.forEach((msg) => merged.set(msg._id, msg));
                incoming.forEach((msg) => merged.set(msg._id, msg));

                return Array.from(merged.values()).sort(
                        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
        }, []);

        const updatePageInfo = useCallback((pageInfo = {}, nextMessages = []) => {
                pageInfoRef.current = {
                        hasMoreBefore: pageInfo.hasMoreBefore ?? pageInfoRef.current.hasMoreBefore,
                        hasMoreAfter: pageInfo.hasMoreAfter ?? pageInfoRef.current.hasMoreAfter,
                        nextBefore: pageInfo.nextBefore ?? nextMessages[0]?._id ?? pageInfoRef.current.nextBefore,
                        nextAfter:
                                pageInfo.nextAfter ?? nextMessages[nextMessages.length - 1]?._id ?? pageInfoRef.current.nextAfter,
                };
        }, []);

        const scrollToBottom = useCallback(() => {
                const el = listRef.current;
                if (!el) return;
                el.scrollTop = el.scrollHeight;
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
                                requestAnimationFrame(scrollToBottom);
                        } catch (err) {
                                console.error("load messages error", err);
                        } finally {
                                fetchingRef.current = false;
                        }
                },
                [authState.authToken, authState.socketInfo.currentRoom, dispatch, scrollToBottom, updatePageInfo]
        );

        const fetchOlderMessages = useCallback(async () => {
                if (
                        !authState.socketInfo.currentRoom ||
                        fetchingRef.current ||
                        !pageInfoRef.current.hasMoreBefore ||
                        !pageInfoRef.current.nextBefore
                ) {
                        return;
                }

                fetchingRef.current = true;
                loadingOlderRef.current = true;
                const el = listRef.current;
                const previousScrollHeight = el?.scrollHeight ?? 0;
                const previousScrollTop = el?.scrollTop ?? 0;

                try {
                        const { messages: olderMessages, pageInfo } = await dispatch(
                                fetchRoomMessages({
                                        roomId: authState.socketInfo.currentRoom,
                                        authToken: authState.authToken,
                                        before: pageInfoRef.current.nextBefore,
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
                                if (!el) return;
                                const newHeight = el.scrollHeight;
                                const adjustedTop = newHeight - previousScrollHeight + previousScrollTop;
                                el.scrollTop = adjustedTop;
                                lastScrollTopRef.current = adjustedTop;

                                rearmScrollTopRef.current = adjustedTop + SCROLL_TRIGGER_PX;

                                if (adjustedTop > SCROLL_TRIGGER_PX * 2) {
                                        topFetchLockedRef.current = false;
                                }
                        });
                } catch (err) {
                        console.error("load older messages error", err);
                } finally {
                        fetchingRef.current = false;
                        loadingOlderRef.current = false;
                }
        }, [authState.authToken, authState.socketInfo.currentRoom, dispatch, mergeMessages, updatePageInfo]);

        const handleScroll = useCallback(
                (e) => {
                        const { scrollTop } = e.target;
                        const scrollingUp = scrollTop < lastScrollTopRef.current;
                        lastScrollTopRef.current = scrollTop;

                        if (loadingOlderRef.current || fetchingRef.current) return;

                        if (topFetchLockedRef.current) {
                                if (scrollTop > rearmScrollTopRef.current) {
                                        topFetchLockedRef.current = false;
                                }

                                if (topFetchLockedRef.current) return;
                        }

                        if (scrollingUp && scrollTop < SCROLL_TRIGGER_PX) {
                                topFetchLockedRef.current = true;
                                fetchOlderMessages();
                        }
                },
                [fetchOlderMessages]
        );

        const resetRoomState = useCallback(() => {
                pageInfoRef.current = { hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null };
                rearmScrollTopRef.current = SCROLL_TRIGGER_PX * 2;
                lastScrollTopRef.current = 0;
                topFetchLockedRef.current = false;
                loadingOlderRef.current = false;
                fetchingRef.current = false;
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
        };
}
