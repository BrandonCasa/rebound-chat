import { Card, CardContent, Typography, useTheme } from "@mui/material";
import React from "react";

const FeatureCard = ({ title, description }) => {
  let theme = useTheme();

  return (
    <Card sx={{ pl: 2, pr: 2, width: "100%" }}>
      <CardContent>
        <Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default FeatureCard;
