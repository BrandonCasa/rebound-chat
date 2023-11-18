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
const chatRoomSchema = new mongoose.Schema({
  roomName: { type: String, required: true, unique: true },
  roomMessages: [{
    bot: { type: Boolean, default: false },
    anonymous: { type: Boolean, default: false },
    userSenderRef: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    altSenderRef: { type: String, required: false },
    messageContents: { type: String, required: true },
    sendTime: { type: Number, required: true },
  }],
});

const ChatRoom = mongoose.model("ChatRoom", chatRoomSchema);

const addRoom = async (roomName) => {
  let room = await ChatRoom.findOne({ roomName: roomName });
  if (room) return;

  room = new ChatRoom({
    roomName,
  });

  await room.save();
  return;
};

const addMessage = async (roomName, username, message) => {
  let room = await ChatRoom.findOne({ roomName: roomName });
  if (!room) return;

  let authorRef = await authImport.User.findOne({ username: username });

  const d = new Date();
  let time = d.getTime();

  if (authorRef === null) {
    room.roomMessages.push({
      bot: username === "System",
      anonymous: username !== "System",
      altSenderRef: username,
      messageContents: message,
      sendTime: time
    });
  } else {
    room.roomMessages.push({
      bot: false,
      anonymous: false,
      userSenderRef: authorRef._id,
      messageContents: message,
      sendTime: time
    });
  }

  let newId = room.roomMessages[room.roomMessages.length - 1]._id;

  await room.save();

  return newId;
};

const retrieveMessages = async (roomName, startFromId) => {
  let room = await ChatRoom.findOne({ roomName: roomName });
  if (!room) return "Room Doesn't Exist";

  let messagesResults = await ChatRoom.aggregate([
    { $match: { _id: mongoose.Types.ObjectId(room._id) } },
    { $unwind: "$roomMessages" },
    { $match: { "roomMessages._id": { $lt: mongoose.Types.ObjectId(startFromId) } } },
    {
      $group: {
        _id: '$_id',
        roomMessages: { $push: '$roomMessages' }
      }
    }
  ]);

  let populatedResults = await ChatRoom.populate(messagesResults, {
    path: 'roomMessages.userSenderRef',
    select: 'username displayName -_id', // select only username and displayName, exclude _id
    match: { bot: { $ne: true }, anonymous: { $ne: true } } // only populate if not bot or anonymous
  });

  //let messages = messagesResults[0] ? messagesResults[0].roomMessages : [];
  let messages = populatedResults[0] ? populatedResults[0].roomMessages : [];

  return messages;
};

module.exports = { addRoom, addMessage, router, ChatRoom, retrieveMessages };
