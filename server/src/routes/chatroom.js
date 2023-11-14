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

/*
// Register endpoint
router.post("/sendMessage", registerLimiter, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, displayName, stayLoggedIn } = req.body;

    // Check if user already exists
    let user = await User.findOne({ username: username });
    if (user) return res.status(400).json({ errors: [{ msg: "User already exists." }] });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    user = new User({
      username,
      password: hashedPassword,
      displayName,
    });

    // Save user
    await user.save();

    // Create and assign a token
    const token = jwt.sign({ _id: user._id }, process.env.SECRET, { expiresIn: stayLoggedIn ? "365d" : "1h" });
    res.status(200).header("auth-token", token).send(token);
  } catch (error) {
    logger.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Login endpoint
router.post("/login", loginLimiter, loginRules, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, stayLoggedIn } = req.body;

    // Find user
    const user = await User.findOne({ username: username });
    if (!user) return res.status(400).json({ errors: [{ msg: "Invalid username or password." }] });

    // Validate password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ errors: [{ msg: "Invalid username or password." }] });

    // Create and assign a token
    const token = jwt.sign({ _id: user._id }, process.env.SECRET, { expiresIn: stayLoggedIn ? "365d" : "1h" });
    res.header("auth-token", token).send(token);
  } catch (error) {
    logger.error(error);
    res.status(500).send("Internal Server Error");
  }
});
*/
module.exports = { addRoom, addMessage, router, ChatRoom };
