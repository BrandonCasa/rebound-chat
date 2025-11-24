import { Box, CircularProgress, List, Typography } from "@mui/material";
import React, { useMemo } from "react";

import { scrollbarStyles } from "../../routes/scrollbarStyles";
import ConstructedMessages from "./ConstructedMessages";

function ChatArea({
        messages,
        previewUser,
        onContextMenu,
        editingMessageId,
        editingText,
        setEditingText,
        commitEdit,
        cancelEdit,
        onScroll,
        listRef,
        hasMoreBefore,
        isLoadingOlder,
}) {
        const boxStyles = useMemo(
                () => ({
                        position: "absolute",
                        left: "0px",
                        top: "0px",
                        right: "0px",
                        bottom: "0px",
                        overflowX: "hidden",
                        overflowY: "auto",
                        padding: 1,
                        display: "flex",
                        flexDirection: "column",
                        ...scrollbarStyles,
                }),
                []
        );

        const renderPaginationIndicator = () => {
                if (isLoadingOlder) {
                        return <CircularProgress size={18} thickness={4} />;
                }

                if (hasMoreBefore === false && messages.length > 0) {
                        return (
                                <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                                        You&apos;re all caught up
                                </Typography>
                        );
                }

                return null;
        };

        return (
                <Box sx={boxStyles} onScroll={onScroll} ref={listRef}>
                        <List disablePadding>
                                <Box
                                        sx={{
                                                display: "flex",
                                                justifyContent: "center",
                                                alignItems: "center",
                                                minHeight: 32,
                                                pb: 1,
                                        }}>
                                        {renderPaginationIndicator()}
                                </Box>
                                <ConstructedMessages
                                        relevantMsgs={messages}
                                        previewUser={previewUser}
                                        onContextMenu={onContextMenu}
                                        editingMessageId={editingMessageId}
                                        editingText={editingText}
                                        setEditingText={setEditingText}
                                        commitEdit={commitEdit}
                                        cancelEdit={cancelEdit}
                                />
                        </List>
                </Box>
        );
}

export default ChatArea;
