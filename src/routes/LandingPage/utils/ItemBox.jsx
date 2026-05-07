import { styled, Box } from "@mui/material";

export const ItemBox = styled(({ "data-testid": dataTestId = "item-box", ...props }) => <Box data-testid={dataTestId} {...props} />)(({ theme }) => ({
	...theme.typography.body2,
	padding: theme.spacing(1),
	textAlign: "center",
	color: theme.palette.text.secondary,
}));
