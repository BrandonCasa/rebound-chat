import { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import { useSelector, useDispatch } from "react-redux";
import socketIoHelper from "../../helpers/socket";
import { addSnackbar } from "../../slices/snackbarSlice";
import { setLoggedIn } from "../../slices/authSlice";

const REQUEST_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:6001/api"
    : globalThis.IN_ELECTRON_ENV
      ? "https://rebound.nexus/api"
      : "/api";
const API_BASE = `${REQUEST_BASE}/users`;

const cache = (u) => {
  if (!u) return null;
  const cleaned = u.replace(/([?&])t=\d+(&)?/, (_, sep, trailing) =>
    trailing ? sep : "",
  );
  return `${cleaned}${cleaned.includes("?") ? "&" : "?"}t=${Date.now()}`;
};

export function useFilePreview(initialUrl) {
  const [file, setFile] = useState(null);
  const [preview, setPrev] = useState(cache(initialUrl));

  const onChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPrev(URL.createObjectURL(f));
  };

  const reset = (url) => {
    setFile(null);
    setPrev(cache(url));
  };

  return { file, preview, onChange, reset };
}

export default function useProfileCard(user, forceSelf) {
  const dispatch = useDispatch();
  const auth = useSelector((s) => s.auth);

  const isSelf = forceSelf || user?.id === auth.userId;
  const rawData = isSelf
    ? auth
    : (user ?? {
        id: null,
        displayName: "",
        username: "",
        bio: "",
        avatarUrl: null,
        bannerUrl: null,
        friends: [],
      });

  const [profile, setProfile] = useState(rawData);
  const [editMode, setEdit] = useState(false);
  const [name, setName] = useState(rawData.displayName);
  const [bio, setBio] = useState(rawData.bio);
  const banner = useFilePreview(rawData.bannerUrl);
  const avatar = useFilePreview(rawData.avatarUrl);

  useEffect(() => {
    setProfile(rawData);
    setName(rawData.displayName);
    setBio(rawData.bio);
    banner.reset(rawData.bannerUrl);
    avatar.reset(rawData.avatarUrl);
  }, [
    rawData.id,
    rawData.displayName,
    rawData.bio,
    rawData.avatarUrl,
    rawData.bannerUrl,
  ]);

  const socket = socketIoHelper.getSocket();
  const watchRef = useRef(null);
  const watchId = profile.id;

  useEffect(() => {
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
  }, [socket, watchId, editMode]);

  useEffect(() => {
    if (!socket) return;
    const onSaved = ([id, data]) => {
      if (id !== watchId) return;
      const av = data.avatarUrl ? cache(REQUEST_BASE + data.avatarUrl) : null;
      const bn = data.bannerUrl ? cache(REQUEST_BASE + data.bannerUrl) : null;
      setProfile((p) => ({ ...p, ...data, avatarUrl: av, bannerUrl: bn }));
      avatar.reset(av);
      banner.reset(bn);
      setName(data.displayName);
      setBio(data.bio);
    };
    socket.on("watched_user_saved", onSaved);
    return () => {
      socket.off("watched_user_saved", onSaved);
    };
  }, [socket, watchId, avatar, banner]);

  const { status, friendId } = useMemo(() => {
    if (isSelf) return { status: "self", friendId: null };
    const rel = profile.friends.find(
      (f) => f.requester === auth.userId || f.recipient === auth.userId,
    );
    if (!rel) return { status: "none", friendId: null };
    if (rel.confirmed) return { status: "friends", friendId: rel._id };
    return rel.requester === auth.userId
      ? { status: "sent", friendId: rel._id }
      : { status: "received", friendId: rel._id };
  }, [profile.friends, isSelf, auth.userId]);

  const callApi = (ep, data, msg, sev = "success") =>
    axios
      .put(`${API_BASE}/${ep}`, data, {
        headers: { Authorization: `Bearer ${auth.authToken}` },
      })
      .then(() =>
        dispatch(
          addSnackbar({
            snackbarMsg: msg,
            snackbarSeverity: sev,
            autoHideDuration: 1500,
          }),
        ),
      )
      .catch(() =>
        dispatch(
          addSnackbar({
            snackbarMsg: "Error",
            snackbarSeverity: "error",
            autoHideDuration: 1500,
          }),
        ),
      );

  const saveProfile = () => {
    const fd = new FormData();
    fd.append("displayName", name);
    fd.append("bio", bio);
    if (banner.file) fd.append("banner", banner.file);
    if (avatar.file) fd.append("avatar", avatar.file);

    axios
      .put(`${API_BASE}/modify`, fd, {
        headers: { Authorization: `Bearer ${auth.authToken}` },
      })
      .then(({ data }) => {
        const u = data.user;
        const full = {
          ...u,
          avatarUrl: u.avatarUrl ? cache(REQUEST_BASE + u.avatarUrl) : null,
          bannerUrl: u.bannerUrl ? cache(REQUEST_BASE + u.bannerUrl) : null,
        };
        dispatch(
          setLoggedIn({
            avatarUrl: full.avatarUrl,
            bannerUrl: full.bannerUrl,
            displayName: full.displayName,
            username: full.username,
            bio: full.bio,
          }),
        );
        setProfile((p) => ({ ...p, ...full }));
        dispatch(
          addSnackbar({
            snackbarMsg: "Profile updated",
            snackbarSeverity: "success",
            autoHideDuration: 1500,
          }),
        );
        setEdit(false);
        avatar.reset(full.avatarUrl);
        banner.reset(full.bannerUrl);
      })
      .catch(() =>
        dispatch(
          addSnackbar({
            snackbarMsg: "Update failed",
            snackbarSeverity: "error",
            autoHideDuration: 1500,
          }),
        ),
      );
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
