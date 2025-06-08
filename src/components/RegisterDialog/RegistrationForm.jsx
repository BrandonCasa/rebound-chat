import PersonRounded from "@mui/icons-material/PersonRounded";
import EmailRounded from "@mui/icons-material/EmailRounded";
import KeyRounded from "@mui/icons-material/KeyRounded";
import NoteRounded from "@mui/icons-material/NoteRounded";
import { Box } from "@mui/material";
import RegisterTextField from "./RegisterTextField";

const RegistrationForm = ({ activeStep, formData, handleFormDataChange }) => {
	if (activeStep === 0) {
		return (
			<>
				<RegisterTextField
					field="username"
					label="Login Name"
					value={formData.username}
					onChange={(val) => handleFormDataChange("username", val, {})}
					helperText="Your private login name."
					errors={formData.usernameErrors}
					icon={PersonRounded}
				/>
				<RegisterTextField
					field="email"
					label="Email"
					type="email"
					value={formData.email}
					onChange={(val) => handleFormDataChange("email", val, {})}
					helperText="Your email address."
					errors={formData.emailErrors}
					icon={EmailRounded}
				/>
				<RegisterTextField
					field="password"
					label="Password"
					type="password"
					value={formData.password}
					onChange={(val) => handleFormDataChange("password", val, {})}
					helperText="Your encrypted password."
					errors={formData.passwordErrors}
					icon={KeyRounded}
				/>
			</>
		);
	}

	if (activeStep === 1) {
		return (
			<>
				<RegisterTextField
					field="displayName"
					label="Display Name"
					value={formData.displayName}
					onChange={(val) => handleFormDataChange("displayName", val, {})}
					helperText="Your public display name."
					errors={formData.displayNameErrors}
					icon={PersonRounded}
				/>
				<RegisterTextField
					field="bio"
					label="About Me"
					value={formData.bio}
					onChange={(val) => handleFormDataChange("bio", val, {})}
					helperText="Your public bio."
					errors={formData.bioErrors}
					icon={NoteRounded}
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
