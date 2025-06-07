import React, { useState, useCallback, memo } from "react";
import * as Icons from "@mui/icons-material";
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Button,
  Dialog,
  DialogTitle,
  DialogActions,
  Box,
  Stack,
} from "@mui/material";
import { styled, alpha } from "@mui/material/styles";

const StyledMenu = styled((props) => (
  <Menu
    elevation={5}
    anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    transformOrigin={{ vertical: "top", horizontal: "center" }}
    {...props}
  />
))(({ theme }) => ({
  "& .MuiPaper-root": {
    borderRadius: 6,
    marginTop: theme.spacing(1),
    minWidth: 150,
    color: theme.palette.text.primary,
    boxShadow:
      "0 0 0 0 rgb(255,255,255), 0 0 0 1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
    "& .MuiMenu-list": {
      padding: "4px 0",
    },
    "& .MuiMenuItem-root": {
      "& .MuiSvgIcon-root": {
        fontSize: 18,
        color: theme.palette.text.secondary,
        marginRight: theme.spacing(1.5),
      },
      "&:active": {
        backgroundColor: alpha(
          theme.palette.primary.main,
          theme.palette.action.selectedOpacity,
        ),
      },
    },
  },
}));

const ConfirmDialog = memo(function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
}) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>Are you sure?</DialogTitle>
      <DialogActions>
        <Button variant="contained" color="error" onClick={onConfirm}>
          Yes
        </Button>
        <Button variant="outlined" color="error" onClick={onCancel}>
          No
        </Button>
      </DialogActions>
    </Dialog>
  );
});

function MessageContextMenu({
  anchorPosition,
  setAnchorPosition,
  onEdit,
  onDelete,
  allowEdit,
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const open = Boolean(anchorPosition);

  const handleClose = useCallback(() => {
    setConfirmOpen(false);
    setAnchorPosition(null);
  }, [setAnchorPosition]);

  const handleEdit = useCallback(() => {
    handleClose();
    onEdit();
  }, [handleClose, onEdit]);

  const handleDeleteClick = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    handleClose();
    onDelete();
  }, [handleClose, onDelete]);

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        onCancel={handleClose}
        onConfirm={handleConfirmDelete}
      />
      <StyledMenu
        id="message-context-menu"
        anchorReference="anchorPosition"
        anchorPosition={
          anchorPosition
            ? { top: anchorPosition.y, left: anchorPosition.x }
            : undefined
        }
        open={open}
        onClose={handleClose}
      >
        <MenuItem disabled={!allowEdit} onClick={handleEdit}>
          <ListItemIcon>
            <Icons.Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>

        <MenuItem disabled={!allowEdit} onClick={handleDeleteClick}>
          <ListItemIcon>
            <Icons.Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </StyledMenu>
    </>
  );
}

export default memo(MessageContextMenu);
