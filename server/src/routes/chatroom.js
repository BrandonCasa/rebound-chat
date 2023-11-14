// Required packages
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");
const logger = require("../logging/logger");
const rateLimit = require("express-rate-limit");
const authImport = require("./auth.js");

const requestRoomHistoryLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 6 times every 5 minutes
  max: 6,
  message: "Too many room history requests from this IP, please try again in a moment",
});

// Create express router
const router = express.Router();

// Chat Room model
const ChatRoom = mongoose.model(
  "ChatRoom",
  new mongoose.Schema({
    roomName: { type: String, required: true, unique: true },
    roomMessages: {
      type: [
        {
          senderRef: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          messageContents: { type: String, required: true },
          sendTime: { type: Number, required: true },
        },
      ],
      required: false,
    },
  })
);

const addRoom = async (roomName) => {
  let room = await ChatRoom.findOne({ roomName: roomName });
  if (room) return;

  room = new ChatRoom({
    roomName,
  });

  await room.save();
};

const addMessage = async (roomName, username, message) => {
  let room = await ChatRoom.findOne({ roomName: roomName });
  if (!room) return;

  let authorRef = await authImport.User.findOne({ username: username }); // add support for system and anon by adding a persistent system and anon user to users db

  const d = new Date();
  let time = d.getTime();

  room.roomMessages.push({ senderRef: authorRef._id, messageContents: message, sendTime: time });

  await room.save();
};

module.exports = { addRoom, addMessage, router, ChatRoom };
