import { useState, useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";

import axios from "axios";
import { fetchRoomMessages, mapMessages } from "../../slices/chatApiSlice";
import { parseMentions } from "../../helpers/mentions";
import { fetchUserProfile } from "../../slices/userApiSlice";
import { addSnackbar } from "../../slices/snackbarSlice";
import { setActiveSocketRoom, emitSocketEvent } from "../../slices/socketSlice";
import { getSocketClient } from "../../helpers/socketClient";
import { dctHashCoarse16bitFromRgb, dctHashFineColor } from "../../helpers/hashimage";
import { buildCsrfApiConfig, getApiBase } from "../../helpers/api";

const MESSAGE_PAGE_SIZE = 50;
const MAX_ATTACHMENTS = 10;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/webm", "video/mp4"];
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

export default function useChatPage() {
	const authState = useSelector((state) => state.auth);
	const sockets = useSelector((s) => s.sockets);
	const dispatch = useDispatch();

	const [message, setMessage] = useState("");
	const [messages, setMessages] = useState([]);
	const [channels, setChannels] = useState({});
	const [users, setUsers] = useState([]);
	const [attachments, setAttachments] = useState([]);
	const [uploadingAttachment, setUploadingAttachment] = useState(false);

	const [roomAnchorEl, setRoomAnchorEl] = useState(null);
	const [userListAnchorEl, setUserListAnchorEl] = useState(null);
	const [userPreviewEl, setUserPreviewEl] = useState(null);
	const [userPreviewUser, setUserPreviewUser] = useState(null);
	const [msgMenuPos, setMsgMenuPos] = useState(null);
	const [selectedMessage, setSelectedMessage] = useState(null);
	const [editingMessageId, setEditingMessageId] = useState(null);
	const [editingText, setEditingText] = useState("");
	const fetchingRef = useRef(false);
	const loadingOlderRef = useRef(false);

	const pageInfoRef = useRef({ hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null, channel: null });

	const uploadAttachments = useCallback(async () => {
		if (!sockets.currentRoom) return [];

		const validAttachments = [];
		for (const file of attachments) {
			if (!file) continue;

			if (validAttachments.length >= MAX_ATTACHMENTS) {
				dispatch(
					addSnackbar({
						snackbarMsg: `You can attach up to ${MAX_ATTACHMENTS} images per message.`,
						snackbarSeverity: "warning",
						autoHideDuration: 2500,
					})
				);
				break;
			}

			if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
				dispatch(
					addSnackbar({
						snackbarMsg: "Only PNG, JPEG, WEBP, GIF, MP4 and WEBM images/videos are supported.",
						snackbarSeverity: "error",
						autoHideDuration: 2500,
					})
				);
				continue;
			}

			if (file.size > MAX_IMAGE_BYTES) {
				dispatch(
					addSnackbar({
						snackbarMsg: "Images must be 16MB or smaller.",
						snackbarSeverity: "error",
						autoHideDuration: 2500,
					})
				);
				continue;
			}

			validAttachments.push(file);
		}

		setAttachments(validAttachments);

		if (!validAttachments.length) return [];

		try {
			setUploadingAttachment(true);

			const hashedAttachments = [];

			for (const file of validAttachments) {
				// Convert File → Image → Canvas → Raw Pixel Data
				const img = await new Promise((resolve, reject) => {
					const image = new Image();
					image.onload = () => resolve(image);
					image.onerror = reject;
					image.src = URL.createObjectURL(file);
				});

				const canvas = new OffscreenCanvas(img.width, img.height);

				const ctx = canvas.getContext("2d");
				ctx.drawImage(img, 0, 0);

				const { data: pixels } = ctx.getImageData(0, 0, canvas.width, canvas.height);

				// Compute coarse hash
				const coarse = dctHashCoarse16bitFromRgb(pixels, canvas.width, canvas.height, 4, {
					hashSize: 8,
					dctSize: 32,
					blurRadius: 1.5,
				});

				const fine = dctHashFineColor(pixels, canvas.width, canvas.height, 4, {
					hashSize: 24,
					dctSize: 128,
				});

				hashedAttachments.push({ file, coarse, fine });
			}

			const hashes = hashedAttachments.map(({ coarse, fine, file }) => ({
				coarse,
				fine,
				size: file?.size,
				name: file?.name,
			}));

			const { data } = await axios.post(`${getApiBase()}/media/check`, { hashes: hashes }, await buildCsrfApiConfig(authState.authToken));

			const results = data?.results ?? [];
			const uploadsToKeep = [];
			const resolvedAttachments = [];
			const finalDocIds = [];

			hashedAttachments.forEach((entry, idx) => {
				const matches = results.find((resultEntry) => resultEntry.index === idx)?.matches ?? [];
				if (!matches.length) {
					uploadsToKeep.push(entry);
					return;
				}

				const bestMatch = matches.reduce((curr, next) => {
					if (!curr) return next;
					return next.size > curr.size ? next : curr;
				}, null);

				const similarityText = typeof bestMatch?.similarity === "number" ? bestMatch.similarity.toFixed(2) : "unknown";
				const confirmMessage = `A similar image already exists (${similarityText}% similarity). Use the existing file (${((bestMatch?.size ?? 0) / 1024).toFixed(1)} KB) instead of uploading ${entry.file.name}? Click Cancel to upload your version.`;

				const useExisting = bestMatch && window.confirm(confirmMessage);

				if (useExisting && bestMatch.size >= entry.file.size) {
					dispatch(
						addSnackbar({
							snackbarMsg: `Using existing image for ${entry.file.name}.`,
							snackbarSeverity: "info",
							autoHideDuration: 2500,
						})
					);

					resolvedAttachments.push({
						url: bestMatch.url,
						size: bestMatch.size,
						contentType: bestMatch.contentType,
						originalName: bestMatch.originalName,
						mediaId: bestMatch._id,
					});
					return;
				}

				uploadsToKeep.push(entry);
			});

			if (!uploadsToKeep.length && resolvedAttachments.length) {
				setAttachments([]);
				return resolvedAttachments;
			}

			if (!uploadsToKeep.length) {
				dispatch(
					addSnackbar({
						snackbarMsg: "No new images to upload after similarity check.",
						snackbarSeverity: "info",
						autoHideDuration: 2500,
					})
				);
				setAttachments([]);
				return resolvedAttachments;
			}

			const uploadMetadata = uploadsToKeep.map(({ coarse, fine, file }) => ({
				coarse,
				fine,
				size: file.size,
				name: file.name,
				type: file.type,
			}));

			const formData = new FormData();
			uploadsToKeep.forEach(({ file }) => formData.append("files", file));
			formData.append("hashes", JSON.stringify(uploadMetadata));

			const { data: uploadResponse } = await axios.post(
				`${getApiBase()}/media/upload`,
				formData,
				await buildCsrfApiConfig(authState.authToken, {
					headers: { "Content-Type": "multipart/form-data" },
				})
			);

			const uploaded = uploadResponse?.attachments ?? [];
			const combined = [...resolvedAttachments, ...uploaded];
			setAttachments([]);
			return combined;
		} catch (err) {
			const snackbarMsg = err?.response?.data?.error || "Unable to upload image.";
			dispatch(
				addSnackbar({
					snackbarMsg,
					snackbarSeverity: "error",
					autoHideDuration: 2500,
				})
			);
			return [];
		} finally {
			setUploadingAttachment(false);
		}
	}, [attachments, authState.authToken, dispatch, sockets]);

	const addChatAttachment = useCallback(
		async (file) => {
			if (!file) return null;
			if (!sockets.currentRoom) return null;

			const isValid = validateImageFile(file, attachments, dispatch);
			if (!isValid) return null;

			setAttachments((prev) => [...prev, file]);

			return null;
		},
		[attachments, dispatch, sockets]
	);

	const removeAttachment = useCallback((fileToRemove) => {
		setAttachments((prev) => prev.filter((file) => file !== fileToRemove));
	}, []);

	const mergeMessages = useCallback((existing, incoming) => {
		const merged = new Map();
		existing.forEach((msg) => merged.set(msg._id, msg));
		incoming.forEach((msg) => merged.set(msg._id, msg));
		const outMsgs = Array.from(merged.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

		return outMsgs;
	}, []);

	const updatePageInfo = useCallback((pageInfo = {}, roomIdOut = undefined, nextMessages = []) => {
		const resolvedChannelCandidate = roomIdOut ?? pageInfo.channel ?? nextMessages[0]?.roomId;
		const resolvedChannel = resolvedChannelCandidate ?? pageInfoRef.current.channel ?? null;

		pageInfoRef.current = {
			hasMoreBefore: pageInfo.hasMoreBefore ?? pageInfoRef.current.hasMoreBefore,
			hasMoreAfter: pageInfo.hasMoreAfter ?? pageInfoRef.current.hasMoreAfter,
			nextBefore: pageInfo.nextBefore ?? nextMessages[0]?._id ?? pageInfoRef.current.nextBefore,
			nextAfter: pageInfo.nextAfter ?? nextMessages[nextMessages.length - 1]?._id ?? pageInfoRef.current.nextAfter,
			channel: resolvedChannel,
		};
	}, []);

	const fetchMessages = useCallback(
		async (roomOverride) => {
			const requestedRoom = roomOverride || sockets.currentRoom || pageInfoRef.current.channel;
			let roomId = pageInfoRef.current.channel || roomOverride || sockets.currentRoom;
			if (!roomId) {
				console.error("Cannot fetch messages without an active channel");
				dispatch(
					addSnackbar({
						snackbarMsg: "Unable to load messages: no active channel.",
						snackbarSeverity: "error",
						autoHideDuration: 2500,
					})
				);
				return;
			}
			updatePageInfo(pageInfoRef.current, roomId);
			if (fetchingRef.current || !authState.authToken || !sockets.connected) return;
			fetchingRef.current = true;
			try {
				const {
					roomId: roomIdOut,
					messages: msgs,
					pageInfo,
				} = await dispatch(
					fetchRoomMessages({
						roomId,
						authToken: authState.authToken,
						limit: MESSAGE_PAGE_SIZE,
					})
				).unwrap();
				const resolvedRoom = roomIdOut || roomId;
				if (resolvedRoom && resolvedRoom !== requestedRoom) {
					return;
				}
				const mapped = msgs || [];
				setMessages(mapped);
				updatePageInfo(pageInfo, resolvedRoom || roomId, mapped);
			} catch (err) {
				console.error("load messages error", err);
			} finally {
				fetchingRef.current = false;
			}
		},
		[sockets.currentRoom, sockets.connected, dispatch, updatePageInfo, authState.authToken]
	);

	const fetchOlderMessages = useCallback(
		async (roomOverride) => {
			let roomId = pageInfoRef.current.channel;
			if (!roomId && roomOverride) {
				updatePageInfo(pageInfoRef.current, roomOverride);
				roomId = roomOverride;
			}
			if (!roomId) {
				console.error("Cannot fetch older messages without an active channel");
				dispatch(
					addSnackbar({
						snackbarMsg: "Unable to load messages: no active channel.",
						snackbarSeverity: "error",
						autoHideDuration: 2500,
					})
				);
				return;
			}
			if (fetchingRef.current || !authState.authToken || !sockets.connected) return;
			if (!pageInfoRef.current.hasMoreBefore) {
				return;
			}

			fetchingRef.current = true;
			loadingOlderRef.current = true;

			try {
				const {
					roomId: roomIdOut,
					messages: olderMessages,
					pageInfo,
				} = await dispatch(
					fetchRoomMessages({
						roomId: roomId,
						authToken: authState.authToken,
						before: pageInfoRef.current.nextBefore,
						limit: MESSAGE_PAGE_SIZE,
					})
				).unwrap();
				const resolvedRoom = roomIdOut || roomId;
				if (resolvedRoom && resolvedRoom !== pageInfoRef.current.channel) {
					return;
				}

				const mapped = olderMessages || [];
				setMessages((prev) => {
					const merged = mergeMessages(prev, mapped);
					updatePageInfo(pageInfo, resolvedRoom || roomId, merged);
					return merged;
				});
			} catch (err) {
				console.error("load older messages error", err);
			} finally {
				fetchingRef.current = false;
				loadingOlderRef.current = false;
			}
		},
		[sockets.currentRoom, sockets.connected, dispatch, mergeMessages, updatePageInfo, authState.authToken]
	);

	const resetRoomState = useCallback(() => {
		pageInfoRef.current = { hasMoreBefore: false, hasMoreAfter: false, nextBefore: null, nextAfter: null, channel: null };
		loadingOlderRef.current = false;
		fetchingRef.current = false;
	}, []);

	useEffect(() => {
		if (sockets.currentRoom) {
			updatePageInfo(pageInfoRef.current, sockets.currentRoom);
		}
	}, [sockets.currentRoom, updatePageInfo]);

	useEffect(() => {
		const socket = getSocketClient();
		if (authState.loggedIn && socket && sockets.connected) {
			socket.on("room_list", ([idMap, roomObjs]) => {
				setChannels(roomObjs);
				if (!sockets.currentRoom) {
					dispatch(
						setActiveSocketRoom({
							lastRoom: null,
							currentRoom: Object.keys(idMap)[0] || null,
						})
					);
				}
			});
			socket.on("joined_room", async (_id, msgs) => {
				if (!sockets.currentRoom) {
					dispatch(
						setActiveSocketRoom({
							lastRoom: null,
							currentRoom: _id || null,
						})
					);
				}
				const mapped = await mapMessages(msgs || []);
				setMessages((prev) => {
					const merged = mergeMessages(prev, mapped);
					updatePageInfo(pageInfoRef.current, _id, merged);
					return merged;
				});
			});
			const handleIncomingMessage = async (payload) => {
				if (!payload) return;
				const normalized = Array.isArray(payload) ? payload : [payload];
				const mapped = await mapMessages(normalized);
				setMessages((prev) => {
					const merged = mergeMessages(prev, mapped);
					updatePageInfo(pageInfoRef.current, pageInfoRef.current.channel, merged);
					return merged;
				});
			};
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
						updatePageInfo(pageInfoRef.current, pageInfoRef.current.channel, filtered);
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
			setUsers([]);
			setMessages([]);
			setAttachments([]);
			resetRoomState();
		};
	}, [
		authState.loggedIn,
		authState.loggingIn,
		authState.userId,
		sockets.connected,
		sockets.currentRoom,
		dispatch,
		mergeMessages,
		updatePageInfo,
		resetRoomState,
	]);

	useEffect(() => {
		setUsers([]);
		setMessage("");
		setAttachments([]);
	}, [sockets.currentRoom]);

	useEffect(() => {
		resetRoomState();
		setMessages([]);
		setMessage("");
		setAttachments([]);
		if (!sockets.currentRoom) return;

		fetchMessages();
	}, [sockets.currentRoom, fetchMessages, resetRoomState]);

	useEffect(
		() => () => {
			dispatch(setActiveSocketRoom({ currentRoom: null }));
		},
		[dispatch]
	);

	const sendMessage = useCallback(
		async (e) => {
			e?.preventDefault();

			if (!sockets.currentRoom) return;
			const trimmedMessage = message?.trim?.() ?? "";
			if (!trimmedMessage && !attachments.length) return;

			const uploadedAttachments = (await uploadAttachments()) || [];

			const mentions = parseMentions(trimmedMessage, users);
			dispatch(
				emitSocketEvent({
					event: "message_room",
					args: [sockets.currentRoom, trimmedMessage, mentions, uploadedAttachments],
				})
			);
			setMessage("");
			setAttachments([]);
		},
		[attachments.length, dispatch, message, sockets.currentRoom, uploadAttachments, users]
	);

	const clickRoomSelect = (e) => {
		setRoomAnchorEl(e.currentTarget);
		setUserListAnchorEl(null);
	};

	const clickUserList = (e) => {
		setUserListAnchorEl(e.currentTarget);
		setRoomAnchorEl(null);
	};

	const previewUser = async (elRef, u) => {
		if (!elRef?.current) {
			setUserPreviewEl(null);
			setUserPreviewUser(null);
			return;
		}
		if (!u?._id) return;
		try {
			const { profile: info } = await dispatch(fetchUserProfile({ userId: u._id, authToken: authState.authToken })).unwrap();
			if (info) {
				setUserPreviewEl(elRef.current);
				setUserPreviewUser(info);
			}
		} catch (err) {
			console.error(err);
		}
	};

	const openMessageMenu = (msg, pos) => {
		setSelectedMessage(msg);
		setMsgMenuPos(pos);
	};

	const closeMessageMenu = () => {
		setMsgMenuPos(null);
		setSelectedMessage(null);
	};

	const startEditSelectedMessage = () => {
		if (!selectedMessage) return;
		setEditingMessageId(selectedMessage._id);
		setEditingText(selectedMessage.content);
		closeMessageMenu();
	};

	const confirmDeleteSelectedMessage = () => {
		if (!selectedMessage || !sockets.currentRoom) return;
		dispatch(emitSocketEvent({ event: "delete_message", args: [sockets.currentRoom, selectedMessage._id] }));
		closeMessageMenu();
	};

	const commitEditMessage = () => {
		if (!editingMessageId || !sockets.currentRoom) return;
		const mentions = parseMentions(editingText, users);
		dispatch(emitSocketEvent({ event: "edit_message", args: [sockets.currentRoom, editingMessageId, editingText, mentions] }));
		setEditingMessageId(null);
		setEditingText("");
	};

	const cancelEditMessage = () => {
		setEditingMessageId(null);
		setEditingText("");
	};

	const validateImageFile = (file, attachments, dispatch) => {
		if (!file) return false;

		if (attachments.length >= MAX_ATTACHMENTS) {
			dispatch(
				addSnackbar({
					snackbarMsg: `You can attach up to ${MAX_ATTACHMENTS} images per message.`,
					snackbarSeverity: "warning",
					autoHideDuration: 2500,
				})
			);
			return false;
		}

		if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
			dispatch(
				addSnackbar({
					snackbarMsg: "Only PNG, JPEG, WEBP, GIF, MP4 and WEBM images/videos are supported.",
					snackbarSeverity: "error",
					autoHideDuration: 2500,
				})
			);
			return false;
		}

		if (file.size > MAX_IMAGE_BYTES) {
			dispatch(
				addSnackbar({
					snackbarMsg: "Images must be 16MB or smaller.",
					snackbarSeverity: "error",
					autoHideDuration: 2500,
				})
			);
			return false;
		}

		return true;
	};

	return {
		authState,
		message,
		setMessage,
		attachments,
		messages,
		setMessages,
		channels,
		currentRoom: sockets.currentRoom,
		users,
		roomAnchorEl,
		setRoomAnchorEl,
		userListAnchorEl,
		setUserListAnchorEl,
		userPreviewEl,
		setUserPreviewEl,
		userPreviewUser,
		setUserPreviewUser,
		msgMenuPos,
		selectedMessage,
		editingMessageId,
		editingText,
		setEditingText,
		sendMessage,
		addChatAttachment,
		removeAttachment,
		uploadingAttachment,
		clickRoomSelect,
		clickUserList,
		previewUser,
		openMessageMenu,
		closeMessageMenu,
		startEditSelectedMessage,
		confirmDeleteSelectedMessage,
		commitEditMessage,
		cancelEditMessage,
		fetchOlderMessages,
		pageInfoRef,
	};
}
