// Imports
import { Avatar, Box, Button, ButtonGroup, Chip, Divider, Paper, Stack, Typography } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";
import React, { useContext, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import * as Icons from "@mui/icons-material";

function FullProfile(props) {
  let theme = useTheme();
  const authState = useSelector((state) => state.auth);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (props?.self && authState.loggedIn === true) {
      //console.log(authState);
      setBio(authState.bio);
      setDisplayName(authState.displayName);
      setUsername(authState.username);
    } else if (props?.user) {
      setBio(props?.user?.bio);
      setDisplayName(props?.user?.displayName);
      setUsername(props?.user?.username);
    }

    return () => {
      setBio("");
      setDisplayName("");
      setUsername("");
    };
  }, [authState.loggedIn]);

  let cardWidth = props?.width || "auto";
  let cardHeight = props?.width || "auto";

  return (
    <Paper
      sx={{ padding: 0, width: cardWidth, height: cardHeight, overflow: "hidden", display: "flex", flexDirection: "column", ...props?.passStyle }}
      elevation={3}
    >
      <Stack spacing={0.5} sx={{ flexGrow: 1, padding: theme.spacing(0.5) }}>
        <img style={{ borderRadius: theme.spacing(0.5) }} src="banner.png" alt="no_banner" />
        <Stack direction="row" spacing={2} sx={{ padding: theme.spacing(0.5) }}>
          <Avatar alt="User" src="defaultpfp.png" sx={{ width: "64px", height: "64px" }} />
          <Stack spacing={0} sx={{ padding: 0, height: "64px" }}>
            <Typography variant="h5" height={"32px"}>
              {displayName}
            </Typography>
            <Typography variant="subtitle2" height={"32px"} sx={{ color: `${theme.palette.text.secondary}` }}>
              {username}
            </Typography>
          </Stack>
          <Stack spacing={0} sx={{ padding: 0, height: "64px", flexGrow: 1, paddingRight: theme.spacing(0.5) }}>
            <Typography textAlign="end" variant="subtitle1" height={"32px"} sx={{ color: `${theme.palette.text.secondary}` }}>
              Troller
            </Typography>
          </Stack>
        </Stack>
        <Paper sx={{ flexGrow: 1, borderWidth: "2px", padding: theme.spacing(0.5) }} variant="outlined">
          <Typography variant="subtitle1" sx={{ color: `${theme.palette.text.primary}` }}>
            About Me:
          </Typography>
          <Typography variant="subtitle2" sx={{ color: `${theme.palette.text.secondary}` }}>
            {bio}
          </Typography>
          <Typography variant="subtitle1" sx={{ color: `${theme.palette.text.primary}` }}>
            Interests:
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip label="Overwatch" variant="outlined" color="secondary" />
            <Chip label="Programming" variant="outlined" color="secondary" />
            <Chip label="Coffee" variant="outlined" color="secondary" />
          </Stack>
        </Paper>
        <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ padding: theme.spacing(0.5) }}>
          <Button variant="contained" color="success">
            Add Friend
          </Button>
          <Button variant="contained" color="primary">
            Block
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function PopoutProfile(props) {
  let theme = useTheme();

  let cardWidth = props?.width || "auto";
  let cardHeight = props?.width ? `calc(${props.width} * 1.6667)` : "auto";

  return <Paper sx={{ padding: theme.spacing(1), width: cardWidth, height: cardHeight }}>xd2</Paper>;
}

function MiniProfile(props) {
  let theme = useTheme();

  let cardWidth = props?.width || "auto";
  let cardHeight = props?.width ? `calc(${props.width} / 4)` : "auto";

  return <Paper sx={{ padding: theme.spacing(1), width: cardWidth, height: cardHeight }}>xd3</Paper>;
}

function ProfileCard(props) {
  let theme = useTheme();

  if (props?.type === "full") {
    return <FullProfile {...props} />;
  }
  if (props?.type === "popout") {
    return <PopoutProfile {...props} />;
  }
  if (props?.type === "mini") {
    return <MiniProfile {...props} />;
  }
}

export default ProfileCard;
