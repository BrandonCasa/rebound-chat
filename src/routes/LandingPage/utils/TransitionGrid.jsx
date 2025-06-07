import { styled } from "@mui/material/styles";
import Grid from "@mui/material/Grid";

export const TransitionGrid = styled(Grid)(({ theme }) => ({
  transition: theme.transitions.create("all", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
}));
