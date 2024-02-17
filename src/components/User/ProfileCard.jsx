// Imports
import { Paper } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";
import React, { useContext, useEffect } from "react";
import { useSelector } from "react-redux";

function FullProfile(props) {
  return `${JSON.stringify(props)}`;
}

function PopoutProfile(props) {
  return "xd2";
}

function MiniProfile(props) {
  return "xd3";
}

function ProfileCard(props) {
  let theme = useTheme();

  if (props?.type === "full") return <FullProfile {...props} theme={theme} />;
  if (props?.type === "popout") return <PopoutProfile {...props} theme={theme} />;
  if (props?.type === "mini") return <MiniProfile {...props} theme={theme} />;
  return <MiniProfile {...props} theme={theme} />;
}

export default ProfileCard;
