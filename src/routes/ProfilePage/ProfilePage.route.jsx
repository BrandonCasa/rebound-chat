// Imports
import { Box, Button, Card, CardContent, CardHeader, Chip, Collapse, Container, Divider, Paper, Stack, Typography } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";
import React, { useContext, useEffect } from "react";
import { TransitionGroup } from "react-transition-group";
import { isSafari, isMobile } from "react-device-detect";
import { useSelector } from "react-redux";
import ProfileCard from "components/User/ProfileCard";
import axios from "axios";

const ItemPaper = styled(Paper)(({ theme }) => ({
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: "center",
  color: theme.palette.text.secondary,
}));
const ItemBox = styled(Box)(({ theme }) => ({
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: "center",
  color: theme.palette.text.secondary,
}));

function ProfilePage(props) {
  let theme = useTheme();
  const authState = useSelector((state) => state.auth);

  useEffect(() => {
    // finish this later
    if (authState.loggedIn === true) {
    }

    return () => {};
  }, [authState.loggedIn]);

  function randomizeBio() {
    const newUser = {
      bio: (Math.random() + 1).toString(36).substring(2),
    };
    const requestString = process.env.NODE_ENV === "development" ? "http://localhost:6001/api/users/modify" : "/api/users/modify";
    axios
      .put(
        requestString,
        { user: newUser },
        {
          headers: {
            "Content-Type": "application/json",
            "Allow-Control-Allow-Origin": "*",
            authorization: `Bearer ${authState.authToken}`,
          },
        }
      )
      .catch((error) => {
        console.log(error);
      });
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1, overflow: "hidden" }}>
      <Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
        <ItemPaper>
          <Typography variant="h4" sx={{ color: `${theme.palette.text.primary}` }}>
            Your Profile
          </Typography>
        </ItemPaper>

        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
          <ProfileCard
            self={true}
            type="full"
            width="100%"
            passStyle={{ maxHeight: "500px", maxWidth: "500px", marginLeft: "auto", marginRight: "auto", marginBottom: 2 }}
          />
          <Button variant="contained" sx={{ maxWidth: "275px", marginLeft: "auto", marginRight: "auto", width: "100%" }} onClick={randomizeBio}>
            Randomize Bio (not recommended)
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

export default ProfilePage;
