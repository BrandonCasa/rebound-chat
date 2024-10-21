import { useTheme } from "@mui/material/styles";
import { Box } from "@mui/material";

function TestingPage(props) {
	const theme = useTheme();

	return (
		<Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1, overflow: "hidden" }}>
			<h1>testing buttons and quick actions</h1>
		</Box>
	);
}

export default TestingPage;
