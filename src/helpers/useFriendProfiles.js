import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchUserProfile } from "../slices/userApiSlice";

// Fetch confirmed friends' profiles for voice chat or other lists
export default function useFriendProfiles() {
	const auth = useSelector((s) => s.auth);
	const dispatch = useDispatch();
	const [friends, setFriends] = useState([]);

	useEffect(() => {
		let active = true;
		async function load() {
			if (!auth.loggedIn) {
				setFriends([]);
				return;
			}
			try {
				const { profile: self } = await dispatch(fetchUserProfile({ authToken: auth.authToken })).unwrap();
				const confirmed = (self.friends || []).filter((r) => r.confirmed);
				const profiles = await Promise.all(
					confirmed.map(async (rel) => {
						const otherId = rel.requester === self.id ? rel.recipient : rel.requester;
						const { profile } = await dispatch(fetchUserProfile({ userId: otherId, authToken: auth.authToken })).unwrap();
						return profile;
					})
				);
				if (active) setFriends(profiles);
			} catch (err) {
				console.error("Failed to load friend profiles", err);
			}
		}
		load();
		return () => {
			active = false;
		};
	}, [auth.authToken, auth.loggedIn, dispatch]);

	return friends;
}
