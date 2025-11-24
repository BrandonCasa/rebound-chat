import { useEffect } from "react";
import useWindowDimensions from "../../../helpers/useWindowDimensions";

export default function useRoomLifecycle({
        authState,
        fetchMessages,
        setMessages,
        setUsers,
        resetRoomState,
        initialFetchRoomRef,
        loadingOlderRef,
        isNearBottom,
        scrollToBottom,
}) {
        const { width, height } = useWindowDimensions();

        useEffect(() => {
                if (loadingOlderRef.current) return;
                if (isNearBottom()) {
                        requestAnimationFrame(scrollToBottom);
                }
        }, [height, isNearBottom, scrollToBottom, width]);

        useEffect(() => {
                const roomId = authState.socketInfo.currentRoom;
                setUsers([]);
                resetRoomState();
                if (!roomId) {
                        initialFetchRoomRef.current = null;
                        setMessages([]);
                        return;
                }

                if (initialFetchRoomRef.current === roomId) return;

                initialFetchRoomRef.current = roomId;
                setMessages([]);
                fetchMessages(roomId);
        }, [authState.authToken, authState.socketInfo.currentRoom, fetchMessages, initialFetchRoomRef, resetRoomState, setMessages, setUsers]);
}
