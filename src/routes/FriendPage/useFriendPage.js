import { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import socketIoHelper from "../../helpers/socket";

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

async function getUserInfo(userId, authToken) {
  const url = `${REQUEST_BASE}/users/profile`;
  try {
    const { data } = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        "Allow-Control-Allow-Origin": "*",
        Authorization: `Bearer ${authToken}`,
      },
      params: { id: userId },
    });
    const u = data.user;
    return {
      ...u,
      avatarUrl: u.avatarUrl ? cache(REQUEST_BASE + u.avatarUrl) : null,
      bannerUrl: u.bannerUrl ? cache(REQUEST_BASE + u.bannerUrl) : null,
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

export default function useFriendPage() {
  const auth = useSelector((state) => state.auth);

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
    const info = await getUserInfo(userId, auth.authToken);
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
    const socket = socketIoHelper.getSocket();

    async function loadRelations() {
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${auth.authToken}` },
        });
        const relations = res.data.user.friends;
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
            const profileRes = await axios.get(`${API_BASE}/profile`, {
              headers: { Authorization: `Bearer ${auth.authToken}` },
              params: { id: otherId },
            });
            return {
              relation: rel,
              profile: {
                ...profileRes.data.user,
                avatarUrl:
                  profileRes.data.user?.avatarUrl &&
                  profileRes.data.user.avatarUrl !== ""
                    ? cache(REQUEST_BASE + profileRes.data.user.avatarUrl)
                    : null,
                bannerUrl:
                  profileRes.data.user?.bannerUrl &&
                  profileRes.data.user.bannerUrl !== ""
                    ? cache(REQUEST_BASE + profileRes.data.user.bannerUrl)
                    : null,
              },
              status,
            };
          }),
        );
        if (isMounted) setFriendItems(items);
      } catch (err) {
        console.error("Error loading friend relations:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadRelations();
    if (socket) {
      socket.emit("watch_user", auth.userId);
      socket.on("watched_user_saved", ([watchedId]) => {
        if (watchedId === auth.userId) loadRelations();
      });
    }
    return () => {
      isMounted = false;
      if (socket) {
        socket.emit("unwatch_user", auth.userId);
        socket.off("watched_user_saved");
      }
    };
  }, [auth.authToken, auth.userId, auth.loggedIn, auth.socketInfo.connected]);

  const callApi = async (ep, data, onSuccessId) => {
    try {
      await axios.put(`${API_BASE}/${ep}`, data, {
        headers: { Authorization: `Bearer ${auth.authToken}` },
      });
      setFriendItems((prev) =>
        prev.filter((item) => item.relation._id !== onSuccessId),
      );
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
