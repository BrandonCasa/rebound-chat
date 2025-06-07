import React from "react";
import MenuRounded from "@mui/icons-material/MenuRounded";
import PeopleRounded from "@mui/icons-material/PeopleRounded";
import {
  Box,
  Button,
  Divider,
  Paper,
  Popover,
  Typography,
  useTheme,
} from "@mui/material";

import useChatPage from "./useChatPage";

import ChatRoomMenu from "../../components/Chat/ChatRoomMenu";
import UserListMenu from "../../components/Chat/UserListMenu";
import ChatArea from "../../components/Chat/ChatArea";
import ChatInput from "../../components/Chat/ChatInput";
import MessageContextMenu from "../../components/Chat/MessageContextMenu";
import ProfileCard from "../../components/User/ProfileCard";

function ChatPage() {
  const theme = useTheme();
  const {
    authState,
    message,
    setMessage,
    messages,
    channels,
    users,
    roomAnchorEl,
    setRoomAnchorEl,
    userListAnchorEl,
    setUserListAnchorEl,
    userPreviewEl,
    setUserPreviewEl,
    userPreviewUser,
    setUserPreviewUser,
    selectedMessage,
    msgMenuPos,
    editingMessageId,
    editingText,
    setEditingText,
    setMessages,
    sendMessage,
    clickRoomSelect,
    clickUserList,
    previewUser,
    openMessageMenu,
    closeMessageMenu,
    startEditSelectedMessage,
    confirmDeleteSelectedMessage,
    commitEditMessage,
    cancelEditMessage,
    handleScroll,
    listRef,
  } = useChatPage();

  return (
    <Box
      sx={{
        display: "flex",
        flexGrow: 1,
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* user preview popover */}
      <Popover
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        anchorEl={userPreviewEl}
        open={Boolean(userPreviewEl)}
        onClose={() => {
          setUserPreviewEl(null);
          setUserPreviewUser(null);
        }}
        sx={{ mb: 2 }}
      >
        <ProfileCard
          self={authState.userId === userPreviewUser?.id}
          user={userPreviewUser}
          width="300px"
          passStyle={{ maxWidth: "300px" }}
        />
      </Popover>

      {/* menus */}
      <ChatRoomMenu
        anchorEl={roomAnchorEl}
        setAnchorEl={setRoomAnchorEl}
        channels={channels}
        setMessages={setMessages}
      />
      <UserListMenu
        anchorEl={userListAnchorEl}
        setAnchorEl={setUserListAnchorEl}
        users={users}
      />
      <MessageContextMenu
        anchorPosition={msgMenuPos}
        setAnchorPosition={closeMessageMenu}
        onEdit={startEditSelectedMessage}
        onDelete={confirmDeleteSelectedMessage}
        allowEdit={selectedMessage?.sender?._id === authState.userId}
      />

      {/* shell */}
      <Paper
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          flexGrow: 1,
          height: "100%",
        }}
      >
        {/* header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            p: 1,
            height: `calc(56px * ${theme.spacing(2)})`,
          }}
        >
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<MenuRounded />}
            onClick={clickRoomSelect}
            sx={{ textTransform: "initial" }}
          >
            <Typography variant="h6" align="center">
              {channels[authState.socketInfo.currentRoom]?.name || "No Room"}
            </Typography>
          </Button>
          <Box flexGrow={1} />
          <Button
            variant="outlined"
            color="secondary"
            endIcon={<PeopleRounded />}
            onClick={clickUserList}
            sx={{ textTransform: "initial" }}
          >
            <Typography variant="h6" align="center">
              {users.length}
            </Typography>
          </Button>
        </Box>

        <Divider />

        {/* messages */}
        <Box sx={{ flexGrow: 1, position: "relative", width: "100%" }}>
          <ChatArea
            messages={messages}
            previewUser={previewUser}
            onContextMenu={openMessageMenu}
            editingMessageId={editingMessageId}
            editingText={editingText}
            setEditingText={setEditingText}
            commitEdit={commitEditMessage}
            cancelEdit={cancelEditMessage}
            onLoadMore={handleLoadMore}
            listRef={listRef}
          />
        </Box>

        {/* input */}
        <ChatInput
          message={message}
          setMessage={setMessage}
          sendMessage={sendMessage}
        />
      </Paper>
    </Box>
  );
}

export default React.memo(ChatPage);
