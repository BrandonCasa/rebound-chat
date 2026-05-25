import { styled } from "@mui/material/styles";
import Grid from "@mui/material/Grid";

export const TransitionGrid = styled(({ "data-testid": dataTestId = "transition-grid", ...props }) => <Grid data-testid={dataTestId} {...props} />)(
	({ theme }) => ({
		transition: theme.transitions.create("all", {
			easing: theme.transitions.easing.sharp,
			duration: theme.transitions.duration.leavingScreen,
		}),
	})
);
