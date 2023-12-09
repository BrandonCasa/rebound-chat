import { Box, IconButton, InputAdornment, TextField, Tooltip, Typography } from "@mui/material";
import * as Icons from "@mui/icons-material";
import { useState } from "react";

const RegistrationForm = ({ activeStep, formData, handleFormDataChange }) => {
  const bioErrorMessages = [formData.bioErrors.long && "Bio is too long."].map((message, index) => {
    if (message) {
      return (
        <Typography key={index} variant="subtitle2" fontWeight={900}>
          - {message}
        </Typography>
      );
    }
  });

  const emailErrorMessages = [
    formData.emailErrors.spaces && "Email must not contain spaces.",
    formData.emailErrors.undefined && "Email is required.",
    formData.emailErrors.emailFormat && "Email has invalid format.",
    formData.emailErrors.long && "Email is too long.",
    formData.emailErrors.case && "Email must be lowercase.",
  ].map((message, index) => {
    if (message) {
      return (
        <Typography key={index} variant="subtitle2" fontWeight={900}>
          - {message}
        </Typography>
      );
    }
  });

  const usernameErrorMessages = [
    formData.usernameErrors.spaces && "Username must not contain spaces.",
    formData.usernameErrors.undefined && "Username is required.",
    formData.usernameErrors.short && "Username must be at least 3 characters long.",
    formData.usernameErrors.long && "Username cannot be longer than 24 characters.",
    formData.usernameErrors.case && "Username must be lowercase.",
  ].map((message, index) => {
    if (message) {
      return (
        <Typography key={index} variant="subtitle2" fontWeight={900}>
          - {message}
        </Typography>
      );
    }
  });

  const passwordErrorMessages = [
    formData.passwordErrors.spaces && "Password must not contain spaces.",
    formData.passwordErrors.undefined && "Password is required.",
    formData.passwordErrors.short && "Password must be at least 5 characters long.",
    formData.passwordErrors.long && "Password cannot be longer than 50 characters.",
  ].map((message, index) => {
    if (message) {
      return (
        <Typography key={index} variant="subtitle2" fontWeight={900}>
          - {message}
        </Typography>
      );
    }
  });

  const displayNameErrorMessages = [
    formData.displayNameErrors.spaces && "Display name must not start or end with spaces.",
    formData.displayNameErrors.undefined && "Display name is required.",
    formData.displayNameErrors.short && "Display name must be at least 3 characters long.",
    formData.displayNameErrors.long && "Display name cannot be longer than 16 characters.",
  ].map((message, index) => {
    if (message) {
      return (
        <Typography key={index} variant="subtitle2" fontWeight={900}>
          - {message}
        </Typography>
      );
    }
  });

  if (activeStep === 0) {
    return (
      <>
        <TextField
          id="current-username"
          sx={{ pb: 2 }}
          error={Object.keys(formData.usernameErrors).length > 0}
          label="Login Name"
          variant="outlined"
          value={formData.username}
          onChange={(e) => handleFormDataChange("username", e.target.value, {})}
          helperText="Your private login name."
          autoComplete="current-username"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Tooltip title={usernameErrorMessages} arrow placement="bottom-start" open={Object.keys(formData.usernameErrors).length > 0}>
                  <span>
                    <IconButton disableTouchRipple disabled={Object.keys(formData.usernameErrors).length <= 0} style={{ color: "rgba(0, 0, 0, 0.26)" }}>
                      {Object.keys(formData.usernameErrors).length > 0 ? (
                        <Icons.PriorityHighRounded style={{ color: "rgba(255, 0, 0, 0.52)" }} />
                      ) : (
                        <Icons.PersonRounded />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
        <TextField
          id="current-email"
          sx={{ pb: 2 }}
          error={Object.keys(formData.emailErrors).length > 0}
          label="Email"
          variant="outlined"
          value={formData.email}
          onChange={(e) => handleFormDataChange("email", e.target.value, {})}
          helperText="Your email address."
          autoComplete="current-email"
          type="email"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Tooltip title={emailErrorMessages} arrow placement="bottom-start" open={Object.keys(formData.emailErrors).length > 0}>
                  <span>
                    <IconButton disableTouchRipple disabled={Object.keys(formData.emailErrors).length <= 0} style={{ color: "rgba(0, 0, 0, 0.26)" }}>
                      {Object.keys(formData.emailErrors).length > 0 ? (
                        <Icons.PriorityHighRounded style={{ color: "rgba(255, 0, 0, 0.52)" }} />
                      ) : (
                        <Icons.EmailRounded />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
        <TextField
          id="current-password"
          sx={{ pb: 1 }}
          error={Object.keys(formData.passwordErrors).length > 0}
          label="Password"
          variant="outlined"
          value={formData.password}
          onChange={(e) => handleFormDataChange("password", e.target.value, {})}
          helperText="Your encrypted password."
          autoComplete="current-password"
          type="password"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Tooltip title={passwordErrorMessages} arrow placement="bottom-start" open={Object.keys(formData.passwordErrors).length > 0}>
                  <span>
                    <IconButton disableTouchRipple disabled={Object.keys(formData.passwordErrors).length <= 0} style={{ color: "rgba(0, 0, 0, 0.26)" }}>
                      {Object.keys(formData.passwordErrors).length > 0 ? (
                        <Icons.PriorityHighRounded style={{ color: "rgba(255, 0, 0, 0.52)" }} />
                      ) : (
                        <Icons.KeyRounded />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
      </>
    );
  }

  if (activeStep === 1) {
    return (
      <>
        <TextField
          id="current-displayName"
          sx={{ pb: 2 }}
          error={Object.keys(formData.displayNameErrors).length > 0}
          label="Display Name"
          variant="outlined"
          value={formData.displayName}
          onChange={(e) => handleFormDataChange("displayName", e.target.value, {})}
          helperText="Your public display name."
          autoComplete="current-displayName"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Tooltip title={displayNameErrorMessages} arrow placement="bottom-start" open={Object.keys(formData.displayNameErrors).length > 0}>
                  <span>
                    <IconButton disableTouchRipple disabled={Object.keys(formData.displayNameErrors).length <= 0} style={{ color: "rgba(0, 0, 0, 0.26)" }}>
                      {Object.keys(formData.displayNameErrors).length > 0 ? (
                        <Icons.PriorityHighRounded style={{ color: "rgba(255, 0, 0, 0.52)" }} />
                      ) : (
                        <Icons.PersonRounded />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
        <TextField
          id="current-aboutMe"
          sx={{ pb: 1 }}
          error={Object.keys(formData.bioErrors).length > 0}
          label="About Me"
          value={formData.bio}
          onChange={(e) => handleFormDataChange("bio", e.target.value, {})}
          variant="outlined"
          helperText="Your public bio."
          autoComplete="current-aboutMe"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Tooltip title={bioErrorMessages} arrow placement="bottom-start" open={Object.keys(formData.bioErrors).length > 0}>
                  <span>
                    <IconButton disableTouchRipple disabled={Object.keys(formData.bioErrors).length <= 0} style={{ color: "rgba(0, 0, 0, 0.26)" }}>
                      {Object.keys(formData.bioErrors).length > 0 ? <Icons.PriorityHighRounded style={{ color: "rgba(255, 0, 0, 0.52)" }} /> : <Icons.NoteRounded />}
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
      </>
    );
  }

  if (activeStep === 2) {
    return <Box sx={{ height: "181.81px" }}>Profile Preview WIP</Box>;
  }

  return null;
};

export default RegistrationForm;
