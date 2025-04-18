import * as Icons from "@mui/icons-material";
import {
  Avatar,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import axios from "axios";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";

import socketIoHelper from "helpers/socket";

import { addSnackbar } from "slices/snackbarSlice";

// Detect Electron environment
const isElectron =
  typeof window !== "undefined" && window.process?.versions?.electron;
// Base API endpoint depending on environment
const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:6001/api/users"
    : isElectron
      ? "https://rebound.nexus/api/users"
      : "/api/users";

function FullProfile({ user, self, width = "auto", passStyle }) {
  const dispatch = useDispatch();
  const authState = useSelector((s) => s.auth);
  const [profile, setProfile] = useState(user);

  const socket = socketIoHelper.getSocket();
  const prevId = useRef();
  const watchedId = self ? authState.userId : user?.id;

  // Sync profile on auth or prop change
  useEffect(() => {
    if (!socket?.connected || !watchedId) return;

    // only emit when the card starts watching a *new* id
    if (prevId.current !== watchedId) {
      if (prevId.current) socket.emit("unwatch_user", prevId.current);
      socket.emit("watch_user", watchedId);
      prevId.current = watchedId;
    }

    const handle = ([id, data]) => {
      console.log(data);
      id === watchedId && setProfile(data);
    };
    socket.on("watched_user_saved", handle);

    return () => {
      socket.emit("unwatch_user", watchedId);
      socket.off("watched_user_saved", handle);
      prevId.current = undefined;
    };
  }, [socket, watchedId]);

  // Friend relation details
  const { isPending, isFriends, isSender, friendId } = useMemo(() => {
    const friends = profile?.friends || [];
    const rel = friends.find((f) =>
      [f.requester, f.recipient].includes(authState.userId),
    );
    if (!rel)
      return {
        isPending: false,
        isFriends: false,
        isSender: false,
        friendId: "",
      };
    return {
      isPending: !rel.confirmed,
      isFriends: Boolean(rel.confirmed),
      isSender: rel.requester === authState.userId,
      friendId: rel._id,
    };
  }, [profile, authState.userId]);

  // HTTP action wrapper
  const handleAction = (endpoint, payload, message, severity = "success") => {
    axios
      .put(`${API_BASE}/${endpoint}`, payload, {
        headers: { authorization: `Bearer ${authState.authToken}` },
      })
      .then(() => {
        dispatch(
          addSnackbar({
            snackbarMsg: message,
            snackbarSeverity: severity,
            autoHideDuration: 3000,
          }),
        );
      })
      .catch(console.error);
  };

  // Loading state
  if (!profile?.id) {
    return (
      <Paper
        sx={{
          width,
          height: passStyle?.maxHeight,
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
        elevation={3}
      ></Paper>
    );
  }

  const { id: userId, displayName, username, bio } = profile;

  return (
    <Paper
      sx={{
        width,
        height: passStyle?.maxHeight || "auto",
        maxHeight: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
      elevation={3}
    >
      <Stack spacing={1} sx={{ p: 1, flex: 1 }}>
        <Box
          component="img"
          src="banner.png"
          alt="banner"
          sx={{
            width: "100%",
            height: 120,
            borderRadius: 1,
            objectFit: "cover",
          }}
        />
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar
            src="defaultpfp.png"
            alt="avatar"
            sx={{ width: 56, height: 56 }}
          />
          <Box>
            <Typography variant="h6">{displayName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {username}
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1, textAlign: "right" }}>
            <Typography variant="subtitle2" color="text.secondary">
              Title
            </Typography>
          </Box>
        </Stack>
        <Paper variant="outlined" sx={{ p: 1, flex: 1 }}>
          <Typography variant="subtitle2">About Me:</Typography>
          <Typography variant="body2" color="text.secondary">
            {bio}
          </Typography>
          <Typography variant="subtitle2" sx={{ mt: 1 }}>
            Interests:
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap" }}>
            <Chip label="Overwatch" variant="outlined" size="small" />
            <Chip label="Programming" variant="outlined" size="small" />
            <Chip label="Coffee" variant="outlined" size="small" />
          </Stack>
        </Paper>
        <Stack
          direction="row"
          spacing={1}
          sx={{ pt: 1 }}
          justifyContent="space-between"
        >
          {!isPending && !isFriends ? (
            <Button
              fullWidth
              size="small"
              variant="contained"
              color="secondary"
              startIcon={<Icons.PersonAdd />}
              disabled={userId === authState.userId}
              onClick={() =>
                handleAction(
                  "addfriend",
                  { recipientId: userId },
                  `Sent friend request to '${displayName}'.`,
                )
              }
            >
              Add
            </Button>
          ) : null}
          {!isPending && isFriends ? (
            <Button
              fullWidth
              size="small"
              variant="contained"
              color="error"
              startIcon={<Icons.PersonRemove />}
              onClick={() =>
                handleAction(
                  "removefriend",
                  { friendId },
                  `Removed friend '${displayName}'.`,
                )
              }
            >
              Remove
            </Button>
          ) : null}
          {isPending && !isFriends && isSender ? (
            <Button
              fullWidth
              size="small"
              variant="outlined"
              color="info"
              startIcon={<Icons.PersonOff />}
              onClick={() =>
                handleAction(
                  "cancelfriend",
                  { friendId },
                  `Canceled friend request to '${displayName}'.`,
                  "info",
                )
              }
            >
              Cancel
            </Button>
          ) : null}
          {isPending && !isFriends && !isSender ? (
            <ButtonGroup fullWidth size="small" variant="contained">
              <Button
                color="success"
                startIcon={<Icons.PersonAdd />}
                onClick={() =>
                  handleAction(
                    "acceptfriend",
                    { friendId },
                    `Accepted friend request from '${displayName}'.`,
                  )
                }
              >
                Accept
              </Button>
              <Button
                color="error"
                startIcon={<Icons.PersonRemove />}
                onClick={() =>
                  handleAction(
                    "declinefriend",
                    { friendId },
                    `Declined friend request from '${displayName}'.`,
                    "warning",
                  )
                }
              >
                Decline
              </Button>
            </ButtonGroup>
          ) : null}
          <Button fullWidth size="small" variant="contained" disabled>
            Block
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function PopoutProfile({ width = "auto" }) {
  const height = width ? `calc(${width} * 1.6667)` : "auto";
  return (
    <Paper sx={{ width, height, p: 1, overflow: "hidden" }} elevation={3}>
      xd2
    </Paper>
  );
}

function MiniProfile({ width = "auto" }) {
  const height = width ? `calc(${width} / 4)` : "auto";
  return (
    <Paper sx={{ width, height, p: 1, overflow: "hidden" }} elevation={3}>
      xd3
    </Paper>
  );
}

export default function ProfileCard(props) {
  switch (props.type) {
    case "popout":
      return <PopoutProfile width={props.width} />;
    case "mini":
      return <MiniProfile width={props.width} />;
    default:
      return <FullProfile {...props} />;
  }
}
