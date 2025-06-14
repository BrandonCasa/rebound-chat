import { Box } from "@mui/material";
import ServerCard from "./ServerCard";

const sampleServers = [
	{
		_id: "s1",
		name: "Rebound HQ",
		tags: ["gaming", "community"],
		groups: [
			{
				_id: "g1",
				name: "General",
				rooms: [
					{ _id: "r1", name: "welcome", description: "Say hello" },
					{ _id: "r2", name: "off-topic", description: "Random chat" },
				],
			},
			{
				_id: "g2",
				name: "Games",
				rooms: [
					{ _id: "r3", name: "valorant" },
					{ _id: "r4", name: "overwatch" },
				],
			},
		],
	},
	{
		_id: "s2",
		name: "Dev Corner",
		tags: ["code", "support"],
		groups: [
			{
				_id: "g3",
				name: "General",
				rooms: [
					{ _id: "r5", name: "introductions" },
					{ _id: "r6", name: "help" },
				],
			},
		],
	},
];

function ServersPage() {
	return (
		<Box
			sx={{
				display: "flex",
				flexGrow: 1,
				flexDirection: "column",
				justifyContent: "center",
				overflow: "hidden",
			}}>
			<Paper
				sx={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					width: "100%",
					flexGrow: 1,
					height: "100%",
				}}></Paper>
		</Box>
	);
}

export default ServersPage;
