import { Typography, Card, Box } from "@mui/material";

const ErrorMessages = ({ errorMessages }) => {
  if (errorMessages.length > 0) {
    return (
      <Card variant="outlined" sx={{ height: "100%", height: "72px", textAlign: "start" }}>
        <Box sx={{ pl: 2, pr: 2, display: "flex", flexDirection: "column" }}>{errorMessages}</Box>
      </Card>
    );
  } else {
    return (
      <Card variant="outlined" sx={{ height: "100%", height: "72px", textAlign: "start" }}>
        <Box sx={{ pl: 2, pr: 2, display: "flex", flexDirection: "column" }}>
          <Typography variant="subtitle" fontWeight={900}>
            - No Errors
          </Typography>
        </Box>
      </Card>
    );
  }
};

export default ErrorMessages;
