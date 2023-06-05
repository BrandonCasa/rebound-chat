import { Typography, Step, StepLabel, Stepper } from "@mui/material";

const StepContent = ({ activeStep }) => (
  <Stepper sx={{ pb: 2, ml: -1, mr: -1, overflow: "hidden" }} activeStep={activeStep}>
    <Step key={0} completed={activeStep > 0}>
      <StepLabel>
        <Typography variant="caption">Registration</Typography>
      </StepLabel>
    </Step>
    <Step key={1} completed={activeStep > 1}>
      <StepLabel>
        <Typography variant="caption">Profile</Typography>
      </StepLabel>
    </Step>
    <Step key={2} completed={activeStep > 2}>
      <StepLabel>
        <Typography variant="caption">Preview</Typography>
      </StepLabel>
    </Step>
  </Stepper>
);

export default StepContent;
