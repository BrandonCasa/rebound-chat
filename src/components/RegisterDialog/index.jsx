import useRegisterDialog from "components/RegisterDialog/useRegisterDialog";
import StepContent from "./StepContent";
import DialogButtons from "./DialogButtons";
import ErrorMessages from "./ErrorMessages";
import RegistrationForm from "./RegistrationForm";
import { Box, Dialog, Typography } from "@mui/material";

const RegisterDialog = () => {
  const {
    registerDialogState,
    activeStep,
    setActiveStep,
    formData,
    setFormData,
    handleFormDataChange,
    handleStayLoggedInChange,
    handleUserRegister,
    handleNextStep,
    handleBackButton,
    handleDialogClose,
    errorMessages,
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
          minHeight: "450px",
        }}
        component="form"
      >
        <Typography variant="h4">Welcome to Rebound</Typography>
        <Typography variant="subtitle" sx={{ pb: 2 }}>
          Register to join a communication network like no other.
        </Typography>
        <StepContent activeStep={activeStep} />
        <RegistrationForm activeStep={activeStep} formData={formData} handleFormDataChange={handleFormDataChange} />
        <ErrorMessages errorMessages={errorMessages} />
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
