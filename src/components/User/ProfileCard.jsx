// Imports
import { Paper } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";
import React, { useContext, useEffect } from "react";
import { useSelector } from "react-redux";

function FullProfile(props) {
  return "xd1";
}

function PopoutProfile(props) {
  return "xd2";
}

function MiniProfile(props) {
  return "xd3";
}

function ProfileCard(props) {
  let theme = useTheme();

  let cardWidth = "auto";
  let cardHeight = "auto";

  if (props.width && props?.type === "full") {
    cardWidth = props.width;
    cardHeight = props.width;
  } else if (props.width && props?.type === "popout") {
    cardWidth = props.width;
    cardHeight = `calc(${props.width} * 1.6667)`;
  } else if (props.width && props?.type === "mini") {
    cardWidth = props.width;
    cardHeight = `calc(${props.width} / 4)`;
  }

  return (
    <Paper sx={{ padding: theme.spacing(1), width: cardWidth, height: cardHeight }}>
      {props?.type === "full" && <FullProfile {...props} theme={theme} />}
      {props?.type === "popout" && <PopoutProfile {...props} theme={theme} />}
      {props?.type === "mini" && <MiniProfile {...props} theme={theme} />}
    </Paper>
  );
}

export default ProfileCard;
