import { useState, useEffect, useMemo, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import socketIoHelper from "../../helpers/socket";
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
        const friends = Array.isArray(source?.friends) ? source.friends : [];
        const mutualFriends = Array.isArray(source?.mutualFriends) ? source.mutualFriends : [];
        const blocked = Array.isArray(source?.blocked) ? source.blocked : [];
        const servers = Array.isArray(source?.servers) ? source.servers : [];
        const serverInvites = Array.isArray(source?.serverInvites) ? source.serverInvites : [];

        return {
                ...DEFAULT_PROFILE,
                ...(source || {}),
                friends,
                mutualFriends,
                pendingFriendInvite: source?.pendingFriendInvite || null,
                blocked,
                servers,
                serverInvites,
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

        const isSelf = forceSelf || user?.id === auth.userId;
        const baseProfile = useMemo(() => {
                const source = isSelf ? auth : user;

                return normalizeProfileData(source);
        }, [isSelf, auth, user]);

        const [profile, setProfile] = useState(baseProfile);
        const [editMode, setEdit] = useState(false);
        const [name, setName] = useState(baseProfile.displayName);
        const [bio, setBio] = useState(baseProfile.bio);
        const banner = useFilePreview(profileMediaUrl(baseProfile.bannerUrl, "banner.webp"));
        const avatar = useFilePreview(profileMediaUrl(baseProfile.avatarUrl, "defaultpfp.webp"));

        useEffect(() => {
                setProfile(baseProfile);
                setName(baseProfile.displayName);
                setBio(baseProfile.bio);
                banner.reset(profileMediaUrl(baseProfile.bannerUrl, "banner.webp"));
                avatar.reset(profileMediaUrl(baseProfile.avatarUrl, "defaultpfp.webp"));
        }, [baseProfile, banner, avatar]);
        const watchRef = useRef(null);
        const watchId = profile.id;

	useEffect(() => {
		const socket = socketIoHelper.getSocket();
		if (!socket?.connected) return;
		if (watchRef.current && (watchRef.current !== watchId || editMode)) {
			socket.emit("unwatch_user", watchRef.current);
			watchRef.current = null;
		}
		if (!editMode && watchId && watchRef.current !== watchId) {
			socket.emit("watch_user", watchId);
			watchRef.current = watchId;
		}
		return () => {
			if (watchRef.current) {
				socket.emit("unwatch_user", watchRef.current);
				watchRef.current = null;
			}
		};
	}, [auth.socketInfo.connected, watchId, editMode]);

	useEffect(() => {
		const socket = socketIoHelper.getSocket();
		if (!socket) return;
                const onSaved = ([id, pubData, privData]) => {
                        if (id !== watchId) return;
                        const data = id === auth.userId ? privData : pubData;
                        const av = profileMediaUrl(data.avatarUrl, "defaultpfp.webp");
                        const bn = profileMediaUrl(data.bannerUrl, "banner.webp");
                        const normalized = normalizeProfileData(data);
                        setProfile((p) => ({ ...p, ...normalized, avatarUrl: av, bannerUrl: bn }));
                        avatar.reset(av);
                        banner.reset(bn);
                        setName(data.displayName);
                        setBio(data.bio);
                };
		socket.on("watched_user_saved", onSaved);
		return () => {
			socket.off("watched_user_saved", onSaved);
		};
	}, [auth.authToken, auth.userId, auth.socketInfo.connected, watchId, avatar, banner]);

        const { status, friendId } = useMemo(() => {
                const normalizeId = (value) => {
                        if (!value) return null;
                        if (typeof value === "string") return value;
                        if (typeof value === "object" && value._id) return value._id.toString();
                        return value.toString?.() || null;
                };

                if (isSelf) return { status: "self", friendId: null };

                const invite = profile.pendingFriendInvite;
                if (invite?._id) {
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
                                const normalized = normalizeProfileData(full);
                                setProfile((p) => ({ ...p, ...normalized }));
                                dispatch(
                                        addSnackbar({
                                                snackbarMsg: "Profile updated",
						snackbarSeverity: "success",
						autoHideDuration: 1500,
					})
				);
				setEdit(false);
				avatar.reset(profileMediaUrl(full.avatarUrl, "defaultpfp.webp"));
				banner.reset(profileMediaUrl(full.bannerUrl, "banner.webp"));
			})
                        .catch((err) => {
                                banner.reset(profileMediaUrl(baseProfile.bannerUrl, "banner.webp"));
                                avatar.reset(profileMediaUrl(baseProfile.avatarUrl, "defaultpfp.webp"));
                                if (err?.error) {
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
