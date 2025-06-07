import {
  Box,
  Paper,
  Stack,
  Typography,
  useTheme,
  Button,
  Divider,
  Chip,
  Slider,
  useMediaQuery,
} from "@mui/material";
import {
  styled,
  darken,
  lighten,
  getContrastRatio,
} from "@mui/material/styles";
import { throttle } from "lodash";
import React, { useCallback, useMemo, useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { scrollbarStyles } from "../../routes/LandingPage/utils/scrollbarStyles";
import {
  updateThemeOverride,
  resetThemeOverrides,
} from "../../slices/settingsSlice";

const ItemPaper = styled(Paper)(({ theme }) => ({
  ...theme.typography.body2,
  padding: theme.spacing(1),
  display: "flex",
  alignItems: "center",
  width: "100%",
  maxWidth: 600,
  margin: "0 auto",
  color: theme.palette.text.secondary,
}));

function SettingsPage() {
  const dispatch = useDispatch();
  const overrides = useSelector((state) => state.settings.overrides);
  const theme = useTheme();
  const isSmUp = useMediaQuery(theme.breakpoints.up("sm"));

  // Expose main colors
  const fields = {
    "palette.primary.main":
      overrides.palette?.primary?.main ?? theme.palette.primary.main,
    "palette.secondary.main":
      overrides.palette?.secondary?.main ?? theme.palette.secondary.main,
    "palette.error.main":
      overrides.palette?.error?.main ?? theme.palette.error.main,
    "palette.warning.main":
      overrides.palette?.warning?.main ?? theme.palette.warning.main,
    "palette.info.main":
      overrides.palette?.info?.main ?? theme.palette.info.main,
    "palette.background.default":
      overrides.palette?.background?.default ??
      theme.palette.background.default,
  };

  // Derive light/dark variants
  const deriveShades = (color) => ({
    light: lighten(color, 0.2),
    dark: darken(color, 0.2),
  });

  const handleColorChange = useCallback(
    (path, value) => {
      if (
        path[0] === "palette" &&
        path[1] === "background" &&
        path[2] === "default"
      ) {
        const darker = darken(value, 0.3);
        const paperColor =
          getContrastRatio(value, darker) < 1.2 ? lighten(value, 0.3) : darker;
        dispatch(
          updateThemeOverride({
            palette: { background: { default: value, paper: paperColor } },
          }),
        );
        return;
      }
      if (path[0] === "palette" && path[2] === "main") {
        const [, key] = path;
        const main = value;
        const { light, dark } = deriveShades(main);
        dispatch(
          updateThemeOverride({ palette: { [key]: { main, light, dark } } }),
        );
        return;
      }
      const payload = {};
      let obj = payload;
      path.forEach((key, idx) => {
        if (idx === path.length - 1) obj[key] = value;
        else {
          obj[key] = {};
          obj = obj[key];
        }
      });
      dispatch(updateThemeOverride(payload));
    },
    [dispatch],
  );

  const throttledHandleColorChange = useMemo(
    () => throttle(handleColorChange, 150),
    [handleColorChange],
  );

  const handleNumberChange = useCallback(
    (path, value) => {
      const num = Number(value);
      const payload = {};
      let obj = payload;
      path.forEach((key, idx) => {
        if (idx === path.length - 1) obj[key] = num;
        else {
          obj[key] = {};
          obj = obj[key];
        }
      });
      dispatch(updateThemeOverride(payload));
    },
    [dispatch],
  );

  const handleReset = () => dispatch(resetThemeOverrides());

  const borderRadius =
    overrides.shape?.borderRadius ?? theme.shape.borderRadius;
  const spacingMultiplier = overrides.shape?.spacingMultiplier ?? 1;

  const [localBorder, setLocalBorder] = useState(borderRadius);
  const [localSpacing, setLocalSpacing] = useState(spacingMultiplier);

  useEffect(() => setLocalBorder(borderRadius), [borderRadius]);
  useEffect(() => setLocalSpacing(spacingMultiplier), [spacingMultiplier]);

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "start",
      }}
    >
      <Stack
        spacing={2}
        sx={{
          width: { xs: "100%", sm: 600 },
          overflowY: "auto",
          overflowX: "hidden",
          ...scrollbarStyles,
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Button variant="outlined" onClick={handleReset}>
            Reset to Default
          </Button>
        </Box>
        <Paper sx={{ p: 2, backgroundColor: theme.palette.background.paper }}>
          <Stack spacing={2}>
            {Object.entries(fields).map(([key, val]) => {
              const parts = key.split(".");
              const label = parts.slice(-2)[0];
              return (
                <Stack
                  key={key}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "flex-start", sm: "center" }}
                >
                  <Typography
                    sx={{
                      width: { xs: "100%", sm: 120 },
                      textTransform: "capitalize",
                    }}
                  >
                    {label}
                  </Typography>
                  <Box sx={{ width: 40 }}>
                    <input
                      type="color"
                      value={val}
                      style={{ width: "100%", height: 40 }}
                      onChange={(e) =>
                        throttledHandleColorChange(parts, e.target.value)
                      }
                      onMouseUp={(e) =>
                        handleColorChange(parts, e.target.value)
                      }
                    />
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        </Paper>
        <Paper sx={{ p: 2, backgroundColor: theme.palette.background.paper }}>
          <Stack spacing={3}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", sm: "center" }}
            >
              <Typography
                sx={{
                  minWidth: 120,
                  textTransform: "capitalize",
                  flexShrink: 0,
                }}
              >
                Rounding
              </Typography>
              <Slider
                sx={{ width: "100%" }}
                min={0}
                max={50}
                step={1}
                value={localBorder}
                onChange={(e, val) => setLocalBorder(val)}
                onChangeCommitted={(e, val) =>
                  handleNumberChange(["shape", "borderRadius"], val)
                }
                valueLabelDisplay="auto"
              />
            </Stack>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", sm: "center" }}
            >
              <Typography
                sx={{
                  minWidth: 120,
                  textTransform: "capitalize",
                  flexShrink: 0,
                }}
              >
                Spacing
              </Typography>
              <Slider
                sx={{ flexGrow: 1 }}
                min={0.25}
                max={2}
                step={0.25}
                value={localSpacing}
                onChange={(e, val) => setLocalSpacing(val)}
                onChangeCommitted={(e, val) =>
                  handleNumberChange(["shape", "spacingMultiplier"], val)
                }
                valueLabelDisplay="auto"
              />
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}

export default SettingsPage;
