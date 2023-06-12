import { Typography, Paper, useTheme } from "@mui/material";
import React from "react";

const LandingHeader = ({ title, subtitle }) => {
  let theme = useTheme();

  return (
    <Paper sx={{ padding: 1 }}>
      <Typography variant="h4" sx={{ color: `${theme.palette.text.primary}` }}>
        {title}
      </Typography>
      <Typography variant="subtitle1" sx={{ color: `${theme.palette.text.secondary}` }} color={theme.palette.text.primary}>
        {subtitle}
      </Typography>
    </Paper>
  );
};

export default LandingHeader;
