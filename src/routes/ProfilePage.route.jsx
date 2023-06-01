// Imports
import { Box, Card, CardContent, CardHeader, Chip, Collapse, Container, Divider, Paper, Stack, Typography } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";
import React, { useContext } from "react";
import { TransitionGroup } from "react-transition-group";
import { isSafari, isMobile } from "react-device-detect";

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

  return (
    <Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1 }}>
      <Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
        <ItemPaper>
          <Typography variant="h4" sx={{ color: `${theme.palette.text.primary}` }}>
            My Profile
          </Typography>
        </ItemPaper>
        <ItemBox>
          <Divider sx={{ "&::after": { borderWidth: "2px" }, "&::before": { borderWidth: "2px" }, margin: 0 }} variant="middle" textAlign="left">
            <Chip color="secondary" label="Preview" />
          </Divider>
        </ItemBox>
      </Stack>
    </Box>
  );
}

export default ProfilePage;
