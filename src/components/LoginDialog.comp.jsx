import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, List, ListItem, Divider, Tabs, Tab, Chip, Paper, Autocomplete, IconButton, Typography } from "@mui/material";
import GoogleButton from "react-google-button";
import { useDispatch, useSelector } from "react-redux";
import { setDialogOpened } from "../reducers/dialogReducer";
import { AddCircleRounded, TagFacesRounded } from "@mui/icons-material";
import styled from "styled-components";
import { useTheme } from "@mui/material/styles";
const interestsList = [{ title: "Gaming" }, { title: "Sports" }, { title: "Anime" }, { title: "Streamers" }, { title: "Memes" }];
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div role="tabpanel" hidden={value !== index} id={`simple-tabpanel-${index}`} {...other}>
      {value === index && children}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
  };
}

const LoginDialog = () => {
  const theme = useTheme();
  const loginDialogState = useSelector((state) => state.dialogs.loginDialogOpen);
  const dispatch = useDispatch();

  const [currentTab, setCurrentTab] = useState(0);

  const handleSetCurrentTab = (event, newValue) => {
    setCurrentTab(newValue);
  };

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleUsernameChange = (event) => {
    setUsername(event.target.value);
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
  };

  const [displayNameRegister, setDisplayNameRegister] = useState("");
  const [emailRegister, setEmailRegister] = useState("");
  const [usernameRegister, setUsernameRegister] = useState("");
  const [passwordRegister, setPasswordRegister] = useState("");
  const [interestInput, setInterestInput] = useState("");
  const [interestsChipData, setInterestsChipData] = React.useState([{ key: 0, label: "Gaming" }]);

  const handleDisplayNameRegisterChange = (event) => {
    setDisplayNameRegister(event.target.value);
  };
  const handleEmailRegisterChange = (event) => {
    setEmailRegister(event.target.value);
  };
  const handleUsernameRegisterChange = (event) => {
    setUsernameRegister(event.target.value);
  };
  const handlePasswordRegisterChange = (event) => {
    setPasswordRegister(event.target.value);
  };

  const handleAddInterest = (chipToAdd) => {
    if (chipToAdd === "") {
      return;
    }
    for (let i = 0; i < interestsChipData.length; i++) {
      if (interestsChipData[i].label === chipToAdd) {
        return;
      }
    }
    let newInterestsChipData = interestsChipData;
    newInterestsChipData.push({ key: interestsChipData.length, label: `${chipToAdd}` });
    setInterestsChipData(newInterestsChipData);
  };

  const handleDeleteInterest = (chipToDelete) => () => {
    // Remove chip and update keys
    let newInterestsChipData = interestsChipData.filter((chip) => chip.key !== chipToDelete.key);
    for (let i = 0; i < newInterestsChipData.length; i++) {
      newInterestsChipData[i].key = i;
    }
    setInterestsChipData(newInterestsChipData);
  };

  const handleInterestInputChange = (event, newValue) => {
    if (newValue !== null && newValue !== "" && newValue !== undefined) {
      setInterestInput(newValue);
    } else if (event.target.value !== "" && event.target.value !== null && event.target.value !== undefined) {
      setInterestInput(event.target.value);
    } else {
      setInterestInput("");
    }
  };

  const handleAddNewInterest = (event) => {
    if (interestInput !== "") {
      handleAddInterest(interestInput);
      setInterestInput("");
    }
  };

  const handleLogin = () => {
    dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }));
  };

  const handleAnonymous = () => {
    // TODO: Handle anonymous session logic here
  };

  return (
    <Dialog
      open={loginDialogState}
      onClose={() => dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }))}
      sx={{
        "& .MuiPaper-root": {
          width: "100vw",
          height: "100vh",
        },
      }}
    >
      <DialogTitle>Authenticate</DialogTitle>
      <DialogContent>
        <Tabs value={currentTab} onChange={handleSetCurrentTab}>
          <Tab label="Login" {...a11yProps(0)} />
          <Tab label="Register" {...a11yProps(1)} />
          <Tab label="Anonymous" {...a11yProps(2)} />
        </Tabs>
        <TabPanel value={currentTab} index={0}>
          <Typography sx={{ mt: 2 }}>Existing Account Info:</Typography>
          <TextField
            autoFocus
            variant="filled"
            margin="dense"
            id="username"
            label="Username"
            type="text"
            value={username}
            onInput={handleUsernameChange}
            fullWidth
            sx={{ backgroundColor: "#383838", ml: 1 }}
            color="primary"
          />
          <TextField
            variant="filled"
            margin="dense"
            id="password"
            label="Password"
            type="password"
            value={password}
            onInput={handlePasswordChange}
            fullWidth
            sx={{ backgroundColor: "#383838", ml: 1 }}
            color="primary"
          />
        </TabPanel>
        <TabPanel value={currentTab} index={1}>
          <Typography sx={{ mt: 2 }}>New Account Info:</Typography>
          <TextField
            autoFocus
            variant="filled"
            margin="dense"
            id="displayname"
            label="Display Name"
            type="text"
            value={displayNameRegister}
            onInput={handleDisplayNameRegisterChange}
            fullWidth
            sx={{ backgroundColor: "#383838", ml: 1 }}
            color="primary"
          />
          <TextField
            variant="filled"
            margin="dense"
            id="EmailRegister"
            label="Email"
            type="email"
            value={emailRegister}
            onInput={handleEmailRegisterChange}
            fullWidth
            sx={{ backgroundColor: "#383838", ml: 1 }}
            color="primary"
          />
          <TextField
            variant="filled"
            margin="dense"
            id="usernameRegister"
            label="Username"
            type="text"
            value={usernameRegister}
            onInput={handleUsernameRegisterChange}
            fullWidth
            sx={{ backgroundColor: "#383838", ml: 1 }}
            color="primary"
          />
          <TextField
            variant="filled"
            margin="dense"
            id="passwordRegister"
            label="Password"
            type="password"
            value={passwordRegister}
            onInput={handlePasswordRegisterChange}
            fullWidth
            sx={{ backgroundColor: "#383838", ml: 1 }}
            color="primary"
          />
          <Typography sx={{ mt: 2 }}>Interests:</Typography>
          <Box
            sx={{
              display: "flex",
              justifyContent: "start",
              flexWrap: "wrap",
              listStyle: "none",
              p: 1,
              m: 0,
              ".MuiSvgIcon-root": {
                color: theme.palette.text.primary,
              },
            }}
            component="ul"
          >
            <Autocomplete
              id="free-solo-demo"
              freeSolo
              value={interestInput}
              selectOnFocus
              onChange={handleInterestInputChange}
              options={interestsList.map((option) => option.title)}
              renderOption={(props, option) => (
                <li {...props} id={`${option}-id`}>
                  {option}
                </li>
              )}
              sx={{ width: "50%", minWidth: "150px" }}
              renderInput={(params) => <TextField {...params} label="Add Interest" onInput={handleInterestInputChange} />}
            />
            <IconButton sx={{ ml: 1, width: 56, height: 56 }} onClick={handleAddNewInterest}>
              <AddCircleRounded />
            </IconButton>
          </Box>
          <Box
            sx={{
              display: "flex",
              justifyContent: "start",
              flexWrap: "wrap",
              listStyle: "none",
              p: 0.5,
              m: 0,
            }}
            component="ul"
          >
            {interestsChipData.map((data) => {
              let icon;

              if (data.label === "React") {
                icon = <TagFacesRounded />;
              }

              return (
                <li key={data.key} style={{ margin: theme.spacing(0.5) }}>
                  <Chip icon={icon} label={data.label} onDelete={handleDeleteInterest(data)} />
                </li>
              );
            })}
          </Box>
        </TabPanel>
        <TabPanel value={currentTab} index={2}>
          Anonymous login in development
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => dispatch(setDialogOpened({ dialogName: "loginDialogOpen", newState: false }))}>Cancel</Button>
        <Button onClick={handleLogin} variant="contained" color="primary">
          {currentTab === 0 ? "Login" : currentTab === 1 ? "Register" : "WIP"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LoginDialog;
