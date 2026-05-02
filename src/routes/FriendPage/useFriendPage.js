import { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchUserProfile, friendAction } from "../../slices/userApiSlice";
import { emitSocketEvent } from "../../slices/socketSlice";
import { getSocketClient } from "../../helpers/socketClient";
async function getUserInfo(userId, authToken, dispatch) {
	try {
		const { profile } = await dispatch(fetchUserProfile({ userId, authToken })).unwrap();
		return profile;
	} catch (err) {
		console.error(err);
		return null;
	}
}

export default function useFriendPage() {
	const auth = useSelector((state) => state.auth);
	const sockets = useSelector((s) => s.sockets);
	const dispatch = useDispatch();

	const [friendItems, setFriendItems] = useState([]);
	const [loading, setLoading] = useState(true);

	const paperRefs = useRef({});
	const [userPreviewEl, setUserPreviewEl] = useState(null);
	const [userPreviewUser, setUserPreviewUser] = useState(null);

	useEffect(() => {
		if (userPreviewEl && !document.body.contains(userPreviewEl)) {
			setUserPreviewEl(null);
			setUserPreviewUser(null);
		}
	}, [friendItems, userPreviewEl]);

	const handleProfilePreview = async (userId, relationId) => {
		if (!userId) return;
		const info = await getUserInfo(userId, auth.authToken, dispatch);
		if (info && paperRefs.current[relationId]) {
			setUserPreviewEl(paperRefs.current[relationId]);
			setUserPreviewUser(info);
		}
	};

	useEffect(() => {
		if (!auth.loggedIn) {
			setLoading(false);
			return;
		}
		let isMounted = true;

		async function loadRelations() {
			setLoading(true);
			try {
				const { profile: selfProfile } = await dispatch(fetchUserProfile({ authToken: auth.authToken })).unwrap();
				const relations = selfProfile.friends || [];
				const items = await Promise.all(
					relations.map(async (rel) => {
						const myId = auth.userId;
						let status, otherId;
						if (rel.confirmed) {
							status = "friends";
							otherId = rel.requester === myId ? rel.recipient : rel.requester;
						} else if (rel.requester === myId) {
							status = "sent";
							otherId = rel.recipient;
						} else {
							status = "received";
							otherId = rel.requester;
						}
						const { profile: otherProfile } = await dispatch(fetchUserProfile({ userId: otherId, authToken: auth.authToken })).unwrap();
						return {
							relation: rel,
							profile: otherProfile,
							status,
						};
					})
				);
				if (isMounted) setFriendItems(items);
			} catch (err) {
				console.error("Error loading friend relations:", err);
			} finally {
				if (isMounted) setLoading(false);
			}
		}

		loadRelations();
		const socket = getSocketClient();
		const onWatchedUserSaved = ([watchedId]) => {
			if (watchedId === auth.userId) loadRelations();
		};

		if (socket && sockets.connected) {
			dispatch(emitSocketEvent({ event: "watch_user", args: [auth.userId] }));
			socket.on("watched_user_saved", onWatchedUserSaved);
		}
		return () => {
			isMounted = false;
			if (socket) {
				dispatch(emitSocketEvent({ event: "unwatch_user", args: [auth.userId] }));
				socket.off("watched_user_saved", onWatchedUserSaved);
			}
		};
	}, [auth.userId, auth.loggedIn, sockets.connected, dispatch]);

	const callApi = async (ep, data, onSuccessId) => {
		try {
			await dispatch(friendAction({ ep, data, authToken: auth.authToken })).unwrap();
			setFriendItems((prev) => prev.filter((item) => item.relation._id !== onSuccessId));
			setUserPreviewEl(null);
			setUserPreviewUser(null);
		} catch (err) {
			console.error(`${ep} failed`, err);
		}
	};

	return {
		friendItems,
		loading,
		paperRefs,
		userPreviewEl,
		setUserPreviewEl,
		userPreviewUser,
		setUserPreviewUser,
		handleProfilePreview,
		callApi,
	};
}
