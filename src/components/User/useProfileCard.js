import { useState, useEffect, useMemo, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { addSnackbar } from "../../slices/snackbarSlice";
import { setLoggedIn } from "../../slices/authSlice";
import { friendAction, modifyProfile } from "../../slices/userApiSlice";
import { getApiBase } from "../../helpers/api";
import { profileMediaUrl } from "../../helpers/mediaUrl";

const REQUEST_BASE = getApiBase();

const DEFAULT_PROFILE = {
	id: null,
	displayName: "",
	username: "",
	bio: "",
	avatarUrl: null,
	bannerUrl: null,
	friends: [],
	mutualFriends: [],
	pendingFriendInvite: null,
	blocked: [],
	servers: [],
	serverInvites: [],
	createdAt: null,
};

const normalizeProfileData = (source) => {
	const safe = source || {};
	const friends = Array.isArray(safe.friends) ? safe.friends : [];
	const mutualFriends = Array.isArray(safe.mutualFriends) ? safe.mutualFriends : [];
	const blocked = Array.isArray(safe.blocked) ? safe.blocked : [];
	const servers = Array.isArray(safe.servers) ? safe.servers : [];
	const serverInvites = Array.isArray(safe.serverInvites) ? safe.serverInvites : [];

	return {
		...DEFAULT_PROFILE,
		...safe,
		friends,
		mutualFriends,
		blocked,
		servers,
		serverInvites,
		pendingFriendInvite: safe.pendingFriendInvite || null,
	};
};

export function useFilePreview(initialUrl) {
	const [file, setFile] = useState(null);
	const [preview, setPrev] = useState(null);

	useEffect(() => {
		setPrev(initialUrl);
	}, [initialUrl]);

	const onChange = (e) => {
		const f = e.target.files?.[0];
		if (!f) return;
		setFile(f);
		setPrev(URL.createObjectURL(f));
	};

	const reset = (url) => {
		setFile(null);
		setPrev(url);
	};

	return { file, preview, onChange, reset };
}

export default function useProfileCard(user, forceSelf) {
	const dispatch = useDispatch();
	const auth = useSelector((s) => s.auth);
	const sockets = useSelector((s) => s.sockets);

	const isSelf = forceSelf || user?.id === auth.userId;

	// Stable "source of truth" like in your last working version, but normalized
	const rawData = useMemo(() => {
		if (isSelf) {
			// auth is the logged-in user; normalize it so shapes are consistent
			return normalizeProfileData({
				// make sure there's an id
				id: auth.userId ?? auth.id ?? null,
				displayName: auth.displayName,
				username: auth.username,
				bio: auth.bio,
				avatarUrl: auth.avatarUrl,
				bannerUrl: auth.bannerUrl,
				friends: auth.friends,
				mutualFriends: auth.mutualFriends,
				pendingFriendInvite: auth.pendingFriendInvite,
				blocked: auth.blocked,
				servers: auth.servers,
				serverInvites: auth.serverInvites,
				createdAt: auth.createdAt,
			});
		}

		if (user) {
			return normalizeProfileData(user);
		}

		// fallback (no user, not self)
		return { ...DEFAULT_PROFILE };
	}, [isSelf, auth, user]);

	const [profile, setProfile] = useState(rawData);
	const [editMode, setEdit] = useState(false);
	const [name, setName] = useState(rawData.displayName);
	const [bio, setBio] = useState(rawData.bio);

	const banner = useFilePreview(profileMediaUrl(rawData.bannerUrl, "banner.webp"));
	const avatar = useFilePreview(profileMediaUrl(rawData.avatarUrl, "defaultpfp.webp"));

	// Keep local state in sync with rawData (like your last working hook)
	useEffect(() => {
		setProfile(rawData);
		setName(rawData.displayName || "");
		setBio(rawData.bio || "");
		banner.reset(profileMediaUrl(rawData.bannerUrl, "banner.webp"));
		avatar.reset(profileMediaUrl(rawData.avatarUrl, "defaultpfp.webp"));
	}, [
		rawData.id,
		rawData.displayName,
		rawData.bio,
		rawData.avatarUrl,
		rawData.bannerUrl,
		// banner.reset, avatar.reset are stable across renders in practice;
		// if ESLint yells you can add them too.
	]);

	const watchRef = useRef(null);
	const watchId = profile.id;

	// watch/unwatch user via socket based on profile.id and editMode
	useEffect(() => {
		if (!sockets.socketClient || !sockets.conneted) return;

		if (watchRef.current && (watchRef.current !== watchId || editMode)) {
			sockets.socketClient.emit("unwatch_user", watchRef.current);
			watchRef.current = null;
		}
		if (!editMode && watchId && watchRef.current !== watchId) {
			sockets.socketClient.emit("watch_user", watchId);
			watchRef.current = watchId;
		}

		return () => {
			if (watchRef.current) {
				sockets.socketClient.emit("unwatch_user", watchRef.current);
				watchRef.current = null;
			}
		};
	}, [sockets.connected, sockets.socketClient, watchId, editMode]);

	// Handle "watched_user_saved" updates
	useEffect(() => {
		if (!sockets.socketClient || !sockets.conneted) return;

		const onSaved = ([id, pubData, privData]) => {
			if (id !== watchId) return;
			const data = id === auth.userId ? privData : pubData;

			const av = profileMediaUrl(data.avatarUrl, "defaultpfp.webp");
			const bn = profileMediaUrl(data.bannerUrl, "banner.webp");

			const normalized = normalizeProfileData({
				...data,
				avatarUrl: av,
				bannerUrl: bn,
			});

			setProfile(normalized);
			avatar.reset(av);
			banner.reset(bn);
			setName(data.displayName || "");
			setBio(data.bio || "");
		};

		sockets.socketClient.on("watched_user_saved", onSaved);
		return () => {
			sockets.socketClient.off("watched_user_saved", onSaved);
		};
	}, [sockets.connected, sockets.socketClient, auth.authToken, auth.userId, watchId, avatar, banner]);

	// Your improved friend-status logic, but on normalized data
	const { status, friendId } = useMemo(() => {
		const normalizeId = (value) => {
			if (!value) return null;
			if (typeof value === "string") return value;
			if (typeof value === "object" && value._id) return value._id.toString();
			return value.toString?.() || null;
		};

		if (isSelf) return { status: "self", friendId: null };

		const invite = profile.pendingFriendInvite;
		if (invite && invite._id) {
			const requesterId = normalizeId(invite.requester);
			const recipientId = normalizeId(invite.recipient);

			if (invite.confirmed) return { status: "friends", friendId: invite._id };
			if (requesterId === auth.userId) return { status: "sent", friendId: invite._id };
			if (recipientId === auth.userId) return { status: "received", friendId: invite._id };
		}

		const friends = Array.isArray(profile.friends) ? profile.friends : [];
		const rel = friends.find((f) => normalizeId(f.requester) === auth.userId || normalizeId(f.recipient) === auth.userId);
		if (!rel) return { status: "none", friendId: null };
		if (rel.confirmed) return { status: "friends", friendId: rel._id };
		return normalizeId(rel.requester) === auth.userId ? { status: "sent", friendId: rel._id } : { status: "received", friendId: rel._id };
	}, [profile.pendingFriendInvite, profile.friends, isSelf, auth.userId]);

	const callApi = (ep, data, msg, sev = "success") => {
		dispatch(
			friendAction({
				ep,
				data,
				authToken: auth.authToken,
				message: msg,
				severity: sev,
			})
		);
	};

	const saveProfile = () => {
		const fd = new FormData();
		fd.append("displayName", name);
		fd.append("bio", bio);
		if (banner.file) fd.append("banner", banner.file);
		if (avatar.file) fd.append("avatar", avatar.file);

		dispatch(modifyProfile({ formData: fd, authToken: auth.authToken }))
			.unwrap()
			.then(({ profile: u }) => {
				const full = u;

				dispatch(
					setLoggedIn({
						avatarUrl: profileMediaUrl(full.avatarUrl, "defaultpfp.webp"),
						bannerUrl: profileMediaUrl(full.bannerUrl, "banner.webp"),
						displayName: full.displayName,
						username: full.username,
						bio: full.bio,
					})
				);

				const av = profileMediaUrl(full.avatarUrl, "defaultpfp.webp");
				const bn = profileMediaUrl(full.bannerUrl, "banner.webp");

				const normalized = normalizeProfileData({
					...full,
					avatarUrl: av,
					bannerUrl: bn,
				});

				setProfile(normalized);

				dispatch(
					addSnackbar({
						snackbarMsg: "Profile updated",
						snackbarSeverity: "success",
						autoHideDuration: 1500,
					})
				);
				setEdit(false);
				avatar.reset(av);
				banner.reset(bn);
			})
			.catch((err) => {
				// revert previews to the last known raw data
				banner.reset(profileMediaUrl(rawData.bannerUrl, "banner.webp"));
				avatar.reset(profileMediaUrl(rawData.avatarUrl, "defaultpfp.webp"));

				if (err && err.error) {
					dispatch(
						addSnackbar({
							snackbarMsg: err.error,
							snackbarSeverity: "error",
							autoHideDuration: 2000,
						})
					);
				} else {
					dispatch(
						addSnackbar({
							snackbarMsg: "Error modifying profile.",
							snackbarSeverity: "error",
							autoHideDuration: 2000,
						})
					);
				}
			});
	};

	return {
		isSelf,
		profile,
		editMode,
		setEdit,
		name,
		setName,
		bio,
		setBio,
		banner,
		avatar,
		status,
		friendId,
		callApi,
		saveProfile,
	};
}
