import React from "react";
import { Box, useTheme } from "@mui/material";

function MessageAttachments({ attachments = [] }) {
	const theme = useTheme();
	const visibleAttachments = (attachments || []).filter((attachment) => attachment?.url);

	if (!visibleAttachments.length) return null;

	return (
		<Box
			data-testid="chat-message-attachments"
			sx={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
				gap: 1,
				width: "100%",
				mb: 1,
			}}>
			{visibleAttachments.map((attachment) => {
				const key = attachment._id || attachment.url || attachment.originalName;
				return (
					<Box
						key={key}
						component="a"
						href={attachment.url}
						target="_blank"
						rel="noreferrer"
						data-testid="chat-message-attachment"
						data-attachment-id={attachment._id || ""}
						aria-label={`Open attachment ${attachment.originalName || "Attachment"}`}
						sx={{
							padding: 1,
							margin: 0,
							marginTop: 1,
							display: "block",
							width: "20vw",
							borderRadius: 1,
							border: `1px solid ${theme.palette.divider}`,
							overflow: "hidden",
							backgroundColor: theme.palette.background.paper,
						}}>
						<Box
							component="img"
							src={attachment.url}
							alt={attachment.originalName || "Attachment"}
							data-testid="chat-message-attachment-image"
							loading="lazy"
							decoding="async"
							style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: 4 }}
						/>
					</Box>
				);
			})}
		</Box>
	);
}

export default React.memo(MessageAttachments);
