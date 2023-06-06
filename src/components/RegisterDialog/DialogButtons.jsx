import { FormGroup, FormControlLabel, Checkbox, Button, DialogActions, Box } from "@mui/material";
import * as Icons from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";

const DialogButtons = ({ handleStayLoggedInChange, formData, handleBackButton, handleNextStep, activeStep, handleToLogin }) => {
  const theme = useTheme();

  return (
    <Box sx={{ mr: -2, mb: -2, ml: -2 }}>
      <Box sx={{ display: "flex", justifyContent: "center", ml: 1, mr: 1, mt: 2, mb: 1, height: "36px" }}>
        <FormGroup sx={{ flexGrow: 1 }}>
          <FormControlLabel
            control={<Checkbox defaultChecked />}
            label="Remember Login"
            onChange={handleStayLoggedInChange}
            value={formData.stayLoggedIn}
            sx={{ height: "36px" }}
          />
        </FormGroup>
        <Button
          variant="outlined"
          onClick={handleBackButton}
          sx={{ width: "64px", height: "36px", mr: 1, opacity: activeStep < 1 ? 0 : 1, transition: "ease-in-out opacity 125ms" }}
        >
          <Icons.KeyboardArrowLeftRounded />
        </Button>
        <Button autoFocus variant="contained" onClick={handleNextStep} sx={{ width: "64px", height: "36px" }}>
          {activeStep === 2 ? <Icons.DoneRounded /> : <Icons.KeyboardDoubleArrowRightRounded />}
        </Button>
      </Box>
      <Button autoFocus variant="contained" onClick={handleToLogin} sx={{ width: "auto", height: "36px", mb: 1, backgroundColor: theme.palette.primary.dark }}>
        Already registered?
      </Button>
    </Box>
  );
};

export default DialogButtons;
