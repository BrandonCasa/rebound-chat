import { Dialog, Box, Typography, TextField, DialogActions, Button, FormGroup, FormControlLabel, Checkbox } from "@mui/material";
import axios from "axios";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { setLoggedIn } from "../slices/authSlice";
import { setDialogOpened } from "../slices/dialogSlice";

import { addSnackbar } from "slices/snackbarSlice";

const LoginDialog = () => {
	const loginDialogState = useSelector((state) => state.dialogs.loginDialogOpen);
	const dispatch = useDispatch();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [stayLoggedIn, setStayLoggedIn] = useState(true);

	const handleUserLogin = () => {
		let requestStringBase = process.env.NODE_ENV === "development" ? `http://localhost:6001/api` : window.isElectron ? `https://rebound.nexus/api` : "/api";
		let requestString = `${requestStringBase}/users/login`;

		axios
			.post(requestString, {
				user: {
					email: email,
					password: password,
					//stayLoggedIn
				},
			})
			.then((res) => {
				if (res.status === 200) {
					window.localStorage.setItem("auth-token", res.data.user.token);
					dispatch(
						setLoggedIn({
							loggedIn: true,
							userId: res.data.user.id,
							username: res.data.user.username,
							displayName: res.data.user.displayName,
							bio: res.data.user.bio,
							authToken: res.data.user.token,
							bannerUrl: res?.data?.user?.bannerUrl && res?.data?.user?.bannerUrl !== "" ? requestStringBase + res.data.user.bannerUrl : globalThis.IN_ELECTRON_ENV ? "banner.webp" : "/banner.webp",
							avatarUrl:
								res?.data?.user?.avatarUrl && res?.data?.user?.avatarUrl !== "" ? requestStringBase + res.data.user.avatarUrl : globalThis.IN_ELECTRON_ENV ? "defaultpfp.webp" : "/defaultpfp.webp",
						})
					);
					dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }));
					dispatch(
						addSnackbar({
							snackbarMsg: `Login Successful. Hello ${res.data.user.displayName}`,
							snackbarSeverity: "success",
							autoHideDuration: 2000,
						})
					);
				}
			})
			.catch((error) => {
				console.log(error.response.data.errors);
				dispatch(
					addSnackbar({
						snackbarMsg: `Login Failed! ${JSON.stringify(error.response.data.errors)}`,
						snackbarSeverity: "error",
						autoHideDuration: 4000,
					})
				);
			});
	};

	return (
		<Dialog open={loginDialogState} onClose={() => dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }))}>
			<Box
				sx={{
					maxWidth: "500px",
					justifyContent: "center",
					display: "flex",
					p: 2,
					flexDirection: "column",
					textAlign: "center",
				}}
				component="form"
			>
				<Typography variant="h4">Welcome Back</Typography>
				<Typography variant="subtitle" sx={{ pb: 2 }}>
					Login to your existing Rebound account.
				</Typography>
				<TextField
					sx={{ pb: 2 }}
					label="Email"
					variant="outlined"
					value={email}
					type="email"
					onChange={(e) => {
						setEmail(e.target.value);
					}}
					autoComplete="current-email"
				/>
				<TextField
					label="Password"
					variant="outlined"
					type="password"
					value={password}
					onChange={(e) => {
						setPassword(e.target.value);
					}}
					autoComplete="current-password"
				/>
				<FormGroup>
					<FormControlLabel control={<Checkbox defaultChecked />} label="Stay Logged In" onChange={(e) => setStayLoggedIn(e.target.checked)} value={stayLoggedIn} />
				</FormGroup>
			</Box>
			<DialogActions>
				<Button
					variant="outlined"
					onClick={() =>
						dispatch(
							setDialogOpened({
								dialogName: "registerDialogOpen",
								newState: true,
								conflictingDialogs: ["loginDialogOpen"],
							})
						)
					}
				>
					Make Account
				</Button>
				<Button variant="contained" onClick={handleUserLogin}>
					Login
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default LoginDialog;
