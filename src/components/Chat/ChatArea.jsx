import { Box, List } from "@mui/material";
import React, { useEffect, useMemo } from "react";

import { scrollbarStyles } from "../../routes/scrollbarStyles";
import ConstructedMessages from "./ConstructedMessages";

function ChatArea({ messages, previewUser, onContextMenu, editingMessageId, editingText, setEditingText, commitEdit, cancelEdit, onScroll, listRef }) {
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

        useEffect(() => {
                const listEl = listRef?.current;
                if (!listEl || !onScroll) return undefined;

                let scrollEndTimeout = null;
                const scrollEndDelay = 120;

                const handleScrollEnd = (event) => {
                        onScroll(event);
                };

                const dispatchSyntheticScrollEnd = () => {
                        if (scrollEndTimeout) {
                                clearTimeout(scrollEndTimeout);
                        }
                        scrollEndTimeout = setTimeout(() => {
                                listEl.dispatchEvent(new Event("scrollend"));
                        }, scrollEndDelay);
                };

                listEl.addEventListener("scrollend", handleScrollEnd);

                // Polyfill scrollend when the browser does not emit it natively.
                const shouldPolyfillScrollEnd = !("onscrollend" in document);
                if (shouldPolyfillScrollEnd) {
                        listEl.addEventListener("scroll", dispatchSyntheticScrollEnd, { passive: true });
                }

                return () => {
                        listEl.removeEventListener("scrollend", handleScrollEnd);
                        if (shouldPolyfillScrollEnd) {
                                listEl.removeEventListener("scroll", dispatchSyntheticScrollEnd);
                        }
                        if (scrollEndTimeout) {
                                clearTimeout(scrollEndTimeout);
                        }
                };
        }, [listRef, onScroll]);

        return (
                <Box sx={boxStyles} ref={listRef}>
                        <List disablePadding>
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
