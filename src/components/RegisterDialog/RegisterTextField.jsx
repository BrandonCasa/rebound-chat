import * as Icons from "@mui/icons-material";
import {
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo } from "react";

const errorMessagesMap = {
  bio: {
    long: "Bio is too long.",
  },
  email: {
    spaces: "Email must not contain spaces.",
    undefined: "Email is required.",
    emailFormat: "Email has invalid format.",
    long: "Email is too long.",
    case: "Email must be lowercase.",
  },
  username: {
    spaces: "Username must not contain spaces.",
    undefined: "Username is required.",
    short: "Username must be at least 3 characters long.",
    long: "Username cannot be longer than 24 characters.",
    case: "Username must be lowercase.",
  },
  password: {
    spaces: "Password must not contain spaces.",
    undefined: "Password is required.",
    short: "Password must be at least 5 characters long.",
    long: "Password cannot be longer than 50 characters.",
  },
  displayName: {
    spaces: "Display name must not start or end with spaces.",
    undefined: "Display name is required.",
    short: "Display name must be at least 3 characters long.",
    long: "Display name cannot be longer than 16 characters.",
  },
};

const buildMessages = (field, errors = {}) => {
  const map = errorMessagesMap[field] || {};
  return Object.entries(errors)
    .filter(([, value]) => !!value)
    .map(([key, value], index) => {
      const msg = key === "altError" ? value : map[key];
      if (!msg) return null;
      return (
        <Typography key={index} variant="subtitle2" fontWeight={900}>
          - {msg}
        </Typography>
      );
    })
    .filter(Boolean);
};

const RegisterTextField = ({
  field,
  value,
  label,
  helperText,
  onChange,
  errors = {},
  icon: Icon,
  type = "text",
}) => {
  const errorMessages = useMemo(
    () => buildMessages(field, errors),
    [field, errors],
  );
  const hasErrors = Object.keys(errors || {}).length > 0;

  return (
    <TextField
      id={`current-${field}`}
      sx={{ pb: 2 }}
      label={label}
      variant="outlined"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText={helperText}
      autoComplete="off"
      type={type}
      error={hasErrors}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Tooltip
                title={errorMessages}
                arrow
                placement="bottom-start"
                open={hasErrors}
              >
                <span>
                  <IconButton
                    disableTouchRipple
                    disabled={!hasErrors}
                    style={{ color: "rgba(0, 0, 0, 0.26)" }}
                  >
                    {hasErrors ? (
                      <Icons.PriorityHighRounded
                        style={{ color: "rgba(255, 0, 0, 0.52)" }}
                      />
                    ) : (
                      <Icon />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </InputAdornment>
          ),
          readOnly: true,
          onFocus: (e) => {
            if (e.target.hasAttribute("readonly")) {
              e.target.removeAttribute("readonly");
              e.target.blur();
              e.target.focus();
            }
          },
        },
      }}
    />
  );
};

export default RegisterTextField;
