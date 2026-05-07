import React from "react";
import { Box, ImageList, ImageListItem, useMediaQuery, useTheme } from "@mui/material";

function MessageAttachments({ attachments = [], maxHeight = 480 }) {
	const theme = useTheme();
	const isXs = useMediaQuery(theme.breakpoints.down("sm"));
	const isMdUp = useMediaQuery(theme.breakpoints.up("md"));

	const visibleAttachments = (attachments || []).filter((attachment) => attachment?.url);

	if (!visibleAttachments.length) return null;

	const cols = visibleAttachments.length === 1 ? 1 : isXs ? 1 : isMdUp ? 3 : 2;

	const getAttachmentKey = (attachment, index) =>
		[attachment?._id, attachment?.url, attachment?.originalName, attachment?.size, attachment?.createdAt, attachment?.updatedAt, index]
			.filter((part) => part !== undefined && part !== null && part !== "")
			.join("-");

	return (
		<Box
			data-testid="chat-message-attachments"
			sx={{
				width: "100%",
				m: 0,
				maxWidth: visibleAttachments.length === 1 ? 420 : 680,
			}}>
			<ImageList
				variant="masonry"
				cols={cols}
				gap={8}
				sx={{
					m: 0,
					width: "100%",
					maxHeight,
					overflowY: "auto",
					overflowX: "hidden",
					pr: 0.5,
					scrollbarGutter: "stable",
				}}>
				{visibleAttachments.map((attachment, index) => {
					const key = getAttachmentKey(attachment, index);
					const name = attachment.originalName || "Attachment";

					return (
						<ImageListItem
							key={key}
							data-testid="chat-message-attachment"
							data-attachment-id={attachment._id || ""}
							sx={{
								borderRadius: 1.5,
								border: `1px solid ${theme.palette.divider}`,
								overflow: "hidden",
								backgroundColor: theme.palette.background.paper,
								boxShadow: theme.shadows[1],
							}}>
							<Box
								component="a"
								href={attachment.url}
								target="_blank"
								rel="noreferrer"
								aria-label={`Open attachment ${name}`}
								sx={{
									display: "block",
									textDecoration: "none",
									lineHeight: 0,
									transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
									"&:hover img": {
										transform: "scale(1.01)",
									},
								}}>
								<Box
									component="img"
									src={attachment.url}
									alt={name}
									data-testid="chat-message-attachment-image"
									loading="lazy"
									decoding="async"
									sx={{
										display: "block",
										width: "100%",
										height: "auto",
										objectFit: "contain",
										backgroundColor: theme.palette.background.default,
										transition: "transform 120ms ease",
									}}
								/>
							</Box>
						</ImageListItem>
					);
				})}
			</ImageList>
		</Box>
	);
}

export default React.memo(MessageAttachments);
