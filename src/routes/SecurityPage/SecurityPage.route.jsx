import { Box, Stack, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import React from "react";

import DeviceSessionsPanel from "../../components/DeviceSessionManager/DeviceSessionManager.jsx";
import PasswordResetCard from "../../components/Security/PasswordResetCard.jsx";

import { scrollbarStyles } from "../scrollbarStyles.js";

const ItemPaper = styled(Box)(({ theme }) => ({
	...theme.typography.body2,
	padding: theme.spacing(1),
	textAlign: "center",
	color: theme.palette.text.secondary,
}));

export default function SecurityPage() {
	return (
		<Box
			data-testid="security-page"
			sx={{
				display: "flex",
				justifyContent: "center",
				flexGrow: 1,
				flexDirection: "column",
			}}>
			<ItemPaper data-testid="security-page-header">
				<Typography variant="h4" color="text.primary">
					Security Dashboard
				</Typography>
			</ItemPaper>
			<Box sx={{ overflowY: "scroll", flexGrow: 1, ...scrollbarStyles }} data-testid="security-page-content">
				<Stack spacing={2}>
					<DeviceSessionsPanel />
					<PasswordResetCard />
				</Stack>
			</Box>
		</Box>
	);
}
