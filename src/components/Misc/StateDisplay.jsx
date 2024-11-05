import React, { useEffect, useState } from "react";
import { Alert, CssBaseline, List, ListItem, ListSubheader, Snackbar, ThemeProvider } from "@mui/material";

function iterateStateProperty(obj, listElementsStack) {
	console.log(JSON.stringify(obj));
	for (const subKey of Object.keys(obj)) {
		console.log(subKey, obj[subKey]);
	}
}

function StateDisplay({ stateIn }) {
	const [listElements, setListElements] = useState([]);

	useEffect(() => {
		setListElements(iterateStateProperty(stateIn, listElements));
		return () => {};
	}, [stateIn]);

	return (
		<List
			sx={{ width: "100%", maxWidth: 360, bgcolor: "background.paper" }}
			subheader={
				<ListSubheader component="div" id="nested-list-subheader">
					Auth State
				</ListSubheader>
			}
		>
			{JSON.stringify(listElements)}
		</List>
	);
}

export default StateDisplay;
