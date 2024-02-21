// Imports
import { Box, Card, CardContent, CardHeader, Chip, Collapse, Container, Divider, Paper, Stack, Typography } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";
import React, { useContext, useEffect } from "react";
import { TransitionGroup } from "react-transition-group";
import { isSafari, isMobile } from "react-device-detect";
import { useSelector } from "react-redux";
import ProfileCard from "components/User/ProfileCard";

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

  return (
    <Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1, overflow: "hidden" }}>
      <Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
        <ItemPaper>
          <Typography variant="h4" sx={{ color: `${theme.palette.text.primary}` }}>
            Your Profile
          </Typography>
        </ItemPaper>

        <ItemBox>
          <Divider sx={{ "&::after": { borderWidth: "3px" }, "&::before": { borderWidth: "3px" }, margin: 0 }} variant="middle" textAlign="left">
            <Chip color="secondary" label="Preview" />
          </Divider>
        </ItemBox>

        <ProfileCard type="full" width="100%" passStyle={{ maxHeight: "500px", maxWidth: "500px" }} />
      </Stack>
    </Box>
  );
}

export default ProfilePage;
