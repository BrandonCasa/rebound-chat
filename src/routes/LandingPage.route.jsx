// Imports
import { Box, Card, CardContent, CardHeader, Chip, Collapse, Container, Divider, Paper, Stack, Typography } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Unstable_Grid2";
import React, { useContext } from "react";
import { TransitionGroup } from "react-transition-group";
import { isSafari, isMobile } from "react-device-detect";

// Define custom scrollbar styles
const scrollbarStyles = {
  "::-webkit-scrollbar": {
    width: "14px",
  },
  "::-webkit-scrollbar-button": {
    display: "none",
  },
  "::-webkit-scrollbar-thumb": {
    boxShadow: "inset 0 0 14px 14px #585859",
    border: "solid 4px transparent",
    borderRadius: "14px",
  },
  "::-webkit-scrollbar-thumb:hover": {
    background: "#262626",
    boxShadow: "inset 0 0 14px 14px #89898B",
    border: "solid 4px transparent",
    borderRadius: "14px",
  },
  "::-webkit-scrollbar-track": {
    boxShadow: "inset 0 0 14px 14px transparent",
    border: "solid 4px transparent",
  },
  "::-webkit-scrollbar-track-piece": {},
  "::-webkit-scrollbar-corner": {},
  "::-webkit-resizer": {},
};

// Custom hook to check if an element has overflow
export const useIsOverflow = (ref, callback) => {
  const [isOverflow, setIsOverflow] = React.useState(undefined);

  React.useLayoutEffect(() => {
    const { current } = ref;

    const trigger = () => {
      const hasOverflow = current.scrollHeight > current.clientHeight;

      setIsOverflow(hasOverflow);

      if (callback) callback(hasOverflow);
    };

    if (current) {
      if ("ResizeObserver" in window) {
        new ResizeObserver(trigger).observe(current);
      }

      trigger();
    }
  }, [callback, ref]);

  return isOverflow;
};

// Define styled components for Paper and Box
const ItemPaper = styled(Paper)(({ theme }) => ({
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: "center",
  color: theme.palette.text.secondary,
}));
const ItemBox = styled(Box)(({ theme }) => ({
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: "center",
  color: theme.palette.text.secondary,
}));

// Define styled component for Grid with transitions
const TransitionGrid = styled(Grid)(({ theme }) => ({
  transition: theme.transitions.create("all", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
}));

// Main LandingPage component
function LandingPage(props) {
  // Get the theme from Material-UI
  let theme = useTheme();

  // Create a ref for overflow element
  const overflowRef = React.useRef();

  // Define callback for when the overflow state changes
  const onIsOverflowChanged = React.useCallback((isOverflowFromCallback) => {
    // ...
  }, []);

  // Use custom hook to get the overflow state
  const isOverflow = useIsOverflow(overflowRef, onIsOverflowChanged);

  // Render the LandingPage component
  return (
    <Box sx={{ display: "flex", justifyContent: "center", flexGrow: 1 }}>
      <Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
        <ItemPaper>
          <Typography variant="h4" sx={{ color: `${theme.palette.text.primary}` }}>
            Introducing Rebound
          </Typography>
          <Typography variant="subtitle1" sx={{ color: `${theme.palette.text.secondary}` }} color={theme.palette.text.primary}>
            The social hub for gamers and friends.
          </Typography>
        </ItemPaper>
        <ItemBox>
          <Divider sx={{ "&::after": { borderWidth: "2px" }, "&::before": { borderWidth: "2px" }, margin: 0 }} variant="middle" textAlign="left">
            <Chip color="secondary" label="Features" />
          </Divider>
        </ItemBox>
        <ItemBox sx={{ height: "100%", width: "100%", flexGrow: 1, position: "relative" }}>
          <Box
            ref={overflowRef}
            sx={{
              position: "absolute",
              left: "0px",
              top: "0px",
              right: isSafari && isMobile ? "-13px" : isOverflow ? "-16px" : "0px",
              bottom: "0px",
              paddingRight: isSafari && isMobile ? "13px" : "0px",
              overflowX: "hidden",
              overflowY: "auto",
              ...scrollbarStyles,
            }}
          >
            <Grid container spacing={2} sx={{ justifyContent: "center" }}>
              <TransitionGrid xs={12} sm={6} md={4} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
                <Card sx={{ pl: 2, pr: 2, width: "100%" }}>
                  <CardContent>
                    <Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
                      Friend Footprints
                    </Typography>
                    <Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
                      Allows you to optionally share your activity trends with friends of your choosing.
                    </Typography>
                  </CardContent>
                </Card>
              </TransitionGrid>
              <TransitionGrid xs={12} sm={6} md={4} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
                <Card sx={{ pl: 2, pr: 2, width: "100%" }}>
                  <CardContent>
                    <Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
                      Theme Designer
                    </Typography>
                    <Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
                      Create the theme of your dreams with custom colors and more.
                    </Typography>
                  </CardContent>
                </Card>
              </TransitionGrid>
              <TransitionGrid xs={12} sm={6} md={4} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
                <Card sx={{ pl: 2, pr: 2, width: "100%" }}>
                  <CardContent>
                    <Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
                      The Hub
                    </Typography>
                    <Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
                      A place to view the activity of your friends and start new conversations.
                    </Typography>
                  </CardContent>
                </Card>
              </TransitionGrid>
              <TransitionGrid xs={12} sm={6} md={4} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
                <Card sx={{ pl: 2, pr: 2, width: "100%" }}>
                  <CardContent>
                    <Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
                      Noise suppression
                    </Typography>
                    <Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
                      Turn noise suppression on/off for someones mic on your end.
                    </Typography>
                  </CardContent>
                </Card>
              </TransitionGrid>
              <TransitionGrid xs={12} sm={6} md={4} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
                <Card sx={{ pl: 2, pr: 2, width: "100%" }}>
                  <CardContent>
                    <Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
                      Unique Profiles
                    </Typography>
                    <Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
                      Profile pages where you can showcase yourself in your way.
                    </Typography>
                  </CardContent>
                </Card>
              </TransitionGrid>
              <TransitionGrid xs={12} sm={6} md={4} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center">
                <Card sx={{ pl: 2, pr: 2, width: "100%" }}>
                  <CardContent>
                    <Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
                      Alt Profiles
                    </Typography>
                    <Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
                      Instead of making a new account, join servers with template profiles of your creation.
                    </Typography>
                  </CardContent>
                </Card>
              </TransitionGrid>
              <TransitionGrid xs={12} sm={6} md={4} alignItems="stretch" maxHeight={200} display="flex" justifyContent="center" sx={{ paddingBottom: 0 }}>
                <Card sx={{ pl: 2, pr: 2, width: "100%" }}>
                  <CardContent>
                    <Typography variant="h5" sx={{ color: `${theme.palette.text.primary}` }}>
                      Watch Together
                    </Typography>
                    <Typography variant="body2" sx={{ color: `${theme.palette.text.secondary}` }}>
                      High quality screen sharing and video chat.
                    </Typography>
                  </CardContent>
                </Card>
              </TransitionGrid>
            </Grid>
          </Box>
        </ItemBox>
      </Stack>
    </Box>
  );
}

// Export LandingPage as default
export default LandingPage;
