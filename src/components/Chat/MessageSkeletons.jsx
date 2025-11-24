import React from "react";
import { Avatar, Box, ListItem, Skeleton } from "@mui/material";

function MessageSkeleton({ index }) {
        return (
                <ListItem
                        disablePadding
                        sx={{
                                alignItems: "flex-start",
                                display: "flex",
                                flexDirection: "column",
                                gap: 1,
                                width: "100%",
                                opacity: 0.85,
                        }}
                        key={`message-skeleton-${index}`}>
                        <Box sx={{ display: "flex", width: "100%", gap: 1 }}>
                                <Skeleton variant="circular">
                                        <Avatar />
                                </Skeleton>
                                <Box sx={{ flexGrow: 1 }}>
                                        <Skeleton variant="text" width="40%" height={18} />
                                        <Skeleton variant="text" width="55%" height={14} />
                                </Box>
                        </Box>
                        <Box sx={{ width: "100%", pl: "48px", display: "flex", flexDirection: "column", gap: 0.5 }}>
                                <Skeleton variant="rounded" height={18} width="90%" />
                                <Skeleton variant="rounded" height={18} width="80%" />
                                <Skeleton variant="rounded" height={18} width="65%" />
                        </Box>
                </ListItem>
        );
}

export default function MessageSkeletons({ count }) {
        if (!count) return null;

        return Array.from({ length: count }).map((_, index) => <MessageSkeleton index={index} key={`message-skeleton-${index}`} />);
}
