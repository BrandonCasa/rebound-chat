import { useCallback, useEffect, useRef } from "react";
import { addSnackbar } from "../../../slices/snackbarSlice";
import { mapMessages } from "../../../slices/chatApiSlice";
import socketIoHelper from "../../../helpers/socket";
import { setSocketRoom } from "../../../slices/authSlice";

export default function useChatSockets({
        authState,
        dispatch,
        setChannels,
        setUsers,
        setMessages,
        mergeMessages,
        updatePageInfo,
        scrollToBottom,
        isNearBottom,
        pageInfoRef,
}) {
        const currentRoomRef = useRef(authState.socketInfo.currentRoom);

        useEffect(() => {
                currentRoomRef.current = authState.socketInfo.currentRoom;
        }, [authState.socketInfo.currentRoom]);

        const handleIncomingMessage = useCallback(
                async (payload) => {
                        if (!payload) return;
                        const normalized = Array.isArray(payload) ? payload : [payload];
                        const mapped = await mapMessages(normalized);
                        setMessages((prev) => {
                                const merged = mergeMessages(prev, mapped);
                                updatePageInfo(pageInfoRef.current, merged);
                                return merged;
                        });
                        if (isNearBottom()) {
                                requestAnimationFrame(scrollToBottom);
                        }
                },
                [isNearBottom, mergeMessages, scrollToBottom, setMessages, updatePageInfo, pageInfoRef]
        );

        useEffect(() => {
                const socket = socketIoHelper.getSocket();
                if (authState.loggedIn && socket) {
                        socket.on("room_list", ([idMap, roomObjs]) => {
                                setChannels(roomObjs);
                                if (!currentRoomRef.current) {
                                        dispatch(
                                                setSocketRoom({
                                                        lastRoom: null,
                                                        currentRoom: Object.keys(idMap)[0] || null,
                                                })
                                        );
                                }
                        });
                        socket.on("joined_room", async (_id, msgs) => {
                                const mapped = await mapMessages(msgs || []);
                                setMessages((prev) => {
                                        const merged = mergeMessages(prev, mapped);
                                        updatePageInfo(pageInfoRef.current, merged);
                                        return merged;
                                });
                                if (mapped.length) {
                                        requestAnimationFrame(scrollToBottom);
                                }
                        });

                        socket.on("message_sent", async (_id, msg) => {
                                await handleIncomingMessage(msg);
                        });
                        socket.on("new_message", async (_id, msg) => {
                                await handleIncomingMessage(msg);
                        });
                        socket.on("messages_updated", async (_id, payload) => {
                                if (payload?.type === "delete" && payload.messageId) {
                                        setMessages((prev) => {
                                                const filtered = prev.filter((m) => m._id !== payload.messageId);
                                                updatePageInfo(pageInfoRef.current, filtered);
                                                return filtered;
                                        });
                                        return;
                                }

                                if (payload?.type === "edit" && payload.message) {
                                        await handleIncomingMessage(payload.message);
                                        return;
                                }

                                await handleIncomingMessage(payload);
                        });
                        socket.on("user_list", (_roomId, list, sender, evt) => {
                                if (sender.id !== authState.userId) {
                                        dispatch(
                                                addSnackbar({
                                                        snackbarMsg: `'${sender.displayName}' ${evt === "join" ? "joined!" : "left."}`,
                                                        snackbarSeverity: "info",
                                                        autoHideDuration: 1500,
                                                })
                                        );
                                }
                                setUsers(list);
                        });
                        socket.emit("list_rooms");
                } else if (!authState.loggingIn && !authState.loggedIn) {
                        dispatch(
                                addSnackbar({
                                        snackbarMsg: "Login or register to use this page.",
                                        snackbarSeverity: "warning",
                                        autoHideDuration: 1500,
                                })
                        );
                }

                return () => {
                        if (socket) {
                                socket.off("room_list");
                                socket.off("joined_room");
                                socket.off("message_sent");
                                socket.off("new_message");
                                socket.off("messages_updated");
                                socket.off("user_list");
                        }
                        setChannels({});
                        setMessages([]);
                        setUsers([]);
                };
        }, [
                authState.loggedIn,
                authState.loggingIn,
                authState.userId,
                authState.socketInfo.connected,
                dispatch,
                handleIncomingMessage,
                scrollToBottom,
                setChannels,
                setMessages,
                setUsers,
                updatePageInfo,
        ]);
}
