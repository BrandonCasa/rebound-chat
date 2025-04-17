import React from "react";
import { Box, Paper, Stack, Typography, useTheme, Button } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useDispatch, useSelector } from "react-redux";
import { updateThemeOverride, resetThemeOverrides } from "slices/settingsSlice";

const ItemPaper = styled(Paper)(({ theme }) => ({
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: "center",
  color: theme.palette.text.secondary,
}));

function SettingsPage() {
  const dispatch = useDispatch();
  const overrides = useSelector((state) => state.settings.overrides);
  const theme = useTheme();

  const primaryColor = overrides.palette?.primary?.main || theme.palette.primary.main;
  const secondaryColor = overrides.palette?.secondary?.main || theme.palette.secondary.main;
  const backgroundColor = overrides.palette?.background?.default || theme.palette.background.default;
  const textPrimary = overrides.palette?.text?.primary || theme.palette.text.primary;
  const textSecondary = overrides.palette?.text?.secondary || theme.palette.text.secondary;

  const handleColorChange = (path, value) => {
    const payload = {};
    let obj = payload;
    path.forEach((key, idx) => {
      if (idx === path.length - 1) {
        obj[key] = value;
      } else {
        obj[key] = {};
        obj = obj[key];
      }
    });
    dispatch(updateThemeOverride(payload));
  };

  const handleReset = () => {
    dispatch(resetThemeOverrides());
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1, overflow: "hidden", flexDirection: "column" }}>
      <Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
        <ItemPaper>
          <Typography variant="h4">Settings</Typography>
        </ItemPaper>
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", p: 2 }}>
          <Stack spacing={3}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography>Primary Color</Typography>
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => handleColorChange(["palette", "primary", "main"], e.target.value)}
              />
              <Typography variant="body2">{primaryColor}</Typography>
            </Stack>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography>Secondary Color</Typography>
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => handleColorChange(["palette", "secondary", "main"], e.target.value)}
              />
              <Typography variant="body2">{secondaryColor}</Typography>
            </Stack>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography>Background Color</Typography>
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => handleColorChange(["palette", "background", "default"], e.target.value)}
              />
              <Typography variant="body2">{backgroundColor}</Typography>
            </Stack>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography>Text Primary Color</Typography>
              <input
                type="color"
                value={textPrimary}
                onChange={(e) => handleColorChange(["palette", "text", "primary"], e.target.value)}
              />
              <Typography variant="body2">{textPrimary}</Typography>
            </Stack>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography>Text Secondary Color</Typography>
              <input
                type="color"
                value={textSecondary}
                onChange={(e) => handleColorChange(["palette", "text", "secondary"], e.target.value)}
              />
              <Typography variant="body2">{textSecondary}</Typography>
            </Stack>
          </Stack>
          <Box sx={{ mt: 4 }}>
            <Button variant="outlined" onClick={handleReset}>
              Reset to Defaults
            </Button>
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}

export default SettingsPage;