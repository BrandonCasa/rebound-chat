import React from "react";
import { AppBar, Toolbar, Typography, Badge, Box, useTheme, useMediaQuery } from "@mui/material";
import { useSelector } from "react-redux";

export default function TitleBar() {
    const theme = useTheme();
    const small = useMediaQuery(theme.breakpoints.down("sm"));
    const notifications = useSelector((s) => Object.keys(s.snackbars.snackbarList).length);
    const barHeight = small ? 28 : 32;

    return (
        <AppBar
            position="fixed"
            color="primary"
            sx={{
                top: 0,
                left: 0,
                right: 0,
                height: `${barHeight}px`,
                WebkitAppRegion: "drag",
                zIndex: theme.zIndex.appBar + 2,
            }}
            elevation={0}
        >
            <Toolbar variant="dense" sx={{ minHeight: barHeight, height: barHeight, px: 1 }}>
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    Rebound
                </Typography>
                <Badge color="secondary" badgeContent={notifications}>
                    <Box sx={{ width: 8, height: 8 }} />
                </Badge>
            </Toolbar>
        </AppBar>
    );
}
