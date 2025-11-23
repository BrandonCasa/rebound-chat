import { Box, Stack, Typography } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import React from "react";
import { useSelector } from "react-redux";

import DeviceSessionsPanel from "../../components/DeviceSessionManager/DeviceSessionManager.jsx";

const ItemPaper = styled(Box)(({ theme }) => ({
	...theme.typography.body2,
	padding: theme.spacing(1),
	textAlign: "center",
	color: theme.palette.text.secondary,
}));

export default function SecurityPage() {
	const theme = useTheme();
	const authState = useSelector((state) => state.auth);

	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				flexGrow: 1,
				overflow: "hidden",
			}}>
			<Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
				<ItemPaper>
					<Typography variant="h4" color="text.primary">
						Security Dashboard
					</Typography>
				</ItemPaper>

				<Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
					<DeviceSessionsPanel />
				</Box>
			</Stack>
		</Box>
	);
}
