import { Box, TextField } from "@mui/material";

const RegistrationForm = ({ activeStep, formData, handleFormDataChange }) => {
  if (activeStep === 0) {
    return (
      <>
        <TextField
          sx={{ pb: 2 }}
          label="Login Name"
          variant="outlined"
          value={formData.username}
          onChange={(e) => handleFormDataChange("username", e.target.value, {})}
          helperText="Your private login name."
          autoComplete="current-username"
        />
        <TextField
          sx={{ pb: 0 }}
          label="Password"
          variant="outlined"
          value={formData.password}
          onChange={(e) => handleFormDataChange("password", e.target.value, {})}
          helperText="Your encrypted password."
          autoComplete="current-password"
          type="password"
        />
      </>
    );
  }

  if (activeStep === 1) {
    return (
      <>
        <TextField
          sx={{ pb: 2 }}
          label="Display Name"
          variant="outlined"
          value={formData.displayName}
          onChange={(e) => handleFormDataChange("displayName", e.target.value, {})}
          helperText="Your public display name."
          autoComplete="current-displayName"
        />
        <TextField
          sx={{ pb: 0 }}
          label="About Me (WIP)"
          variant="outlined"
          value={formData.displayName}
          onChange={(e) => handleFormDataChange("displayName", e.target.value, {})}
          helperText="A brief description of yourself. (wont save)"
          autoComplete="current-aboutMe"
        />
      </>
    );
  }

  if (activeStep === 2) {
    return <Box sx={{ height: "173.81px" }}>Profile Preview WIP</Box>;
  }

  return null;
};

export default RegistrationForm;
