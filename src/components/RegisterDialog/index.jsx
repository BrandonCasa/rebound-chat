import { Box, Dialog, Typography } from "@mui/material";

import DialogButtons from "./DialogButtons";
import RegistrationForm from "./RegistrationForm";
import StepContent from "./StepContent";

import useRegisterDialog from "./useRegisterDialog";

const RegisterDialog = () => {
	const {
		registerDialogState,
		activeStep,
		formData,
		handleFormDataChange,
		handleStayLoggedInChange,
		handleNextStep,
		handleBackButton,
		handleDialogClose,
		handleToLogin,
	} = useRegisterDialog();

	// Rest of your component's logic goes here...

	return (
		<Dialog open={registerDialogState} onClose={handleDialogClose}>
			<Box
				sx={{
					justifyContent: "center",
					display: "flex",
					p: 2,
					flexDirection: "column",
					textAlign: "center",
				}}
				component="form">
				<Typography variant="h4" sx={{ pb: 2 }}>
					Welcome to Rebound
				</Typography>
				<StepContent activeStep={activeStep} />
				<RegistrationForm activeStep={activeStep} formData={formData} handleFormDataChange={handleFormDataChange} />
				<DialogButtons
					handleStayLoggedInChange={handleStayLoggedInChange}
					formData={formData}
					handleBackButton={handleBackButton}
					handleNextStep={handleNextStep}
					activeStep={activeStep}
					handleToLogin={handleToLogin}
				/>
			</Box>
		</Dialog>
	);
};

export default RegisterDialog;
