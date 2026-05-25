import { Paper, Typography, List, ListSubheader, ListItem, Box } from "@mui/material";

function ServerCard({ server }) {
	if (!server) return null;
	return (
		<Paper sx={{ p: 2, mb: 2, width: "100%", maxWidth: 600 }} data-testid="server-card" data-server-id={server._id || ""}>
			<Typography variant="h5" gutterBottom>
				{server.name}
			</Typography>
			{server.tags?.length ? (
				<Typography variant="body2" color="text.secondary" gutterBottom>
					{server.tags.join(", ")}
				</Typography>
			) : null}
			{server.groups?.map((group) => (
				<List
					key={group._id}
					dense
					disablePadding
					data-testid="server-card-group-list"
					data-group-id={group._id || ""}
					subheader={<ListSubheader>{group.name}</ListSubheader>}>
					{group.rooms?.map((room) => (
						<ListItem key={room._id} sx={{ pl: 4 }} data-testid="server-card-room-item" data-room-id={room._id || ""}>
							<Box>
								<Typography>{room.name}</Typography>
								{room.description && (
									<Typography variant="caption" color="text.secondary">
										{room.description}
									</Typography>
								)}
							</Box>
						</ListItem>
					))}
				</List>
			))}
		</Paper>
	);
}

export default ServerCard;
