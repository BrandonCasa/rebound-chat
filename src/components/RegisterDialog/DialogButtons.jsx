import KeyboardArrowLeftRounded from "@mui/icons-material/KeyboardArrowLeftRounded";
import DoneRounded from "@mui/icons-material/DoneRounded";
import { FormGroup, FormControlLabel, Checkbox, Button, Box, ButtonGroup } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
const DialogButtons = ({ handleStayLoggedInChange, formData, handleBackButton, handleNextStep, activeStep, handleToLogin }) => {
	const theme = useTheme();

	return (
		<Box sx={{ mt: 1, display: "flex", gap: 1 }} data-testid="register-dialog-buttons">
			<Button
				variant="contained"
				onClick={handleToLogin}
				sx={{ height: "36px", backgroundColor: theme.palette.primary.dark }}
				fullWidth
				data-testid="register-to-login-button">
				Already registered?
			</Button>
			<Button
				variant="contained"
				onClick={handleBackButton}
				data-testid="register-back-button"
				sx={{
					px: 0.5,
					minWidth: "36px",
					height: "36px",
					opacity: activeStep < 1 ? 0 : 1,
					transition: "ease-in-out opacity 125ms",
					display: activeStep < 1 ? "none" : "inherit",
				}}>
				<KeyboardArrowLeftRounded />
			</Button>
			<Button
				variant="contained"
				onClick={handleNextStep}
				data-testid="register-next-button"
				sx={{
					minWidth: "36px",
					height: "36px",
				}}
				color={activeStep === 2 ? "success" : "info"}>
				{activeStep === 2 ? <DoneRounded /> : <ArrowForwardRoundedIcon />}
			</Button>
		</Box>
	);
};

export default DialogButtons;
