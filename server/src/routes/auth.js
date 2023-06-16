// Required packages
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");
const logger = require("../logging/logger");
const rateLimit = require("express-rate-limit");

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many accounts created from this IP, please try again after an hour",
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts from this IP, please try again after an hour",
});

// Create express router
const router = express.Router();

// User model
const User = mongoose.model(
  "User",
  new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    displayName: { type: String, required: true },
  })
);

// Validation rules
const registerRules = [
  // Display name Rules
  body("displayName").custom((value, { req }) => {
    if (typeof value === "string" && (value.toString().startsWith(" ") || value.toString().endsWith(" "))) {
      throw new Error("Display name must not start or end with spaces.");
    }
    if (value === undefined || value === null || value === "") {
      throw new Error("Display name is required.");
    }
    if (value.length < 3) {
      throw new Error("Display name must be at least 3 characters long.");
    }
    if (value.length > 16) {
      throw new Error("Display name cannot be longer than 16 characters.");
    }
    return true;
  }),

  // Username Rules
  body("username").custom((value, { req }) => {
    if (typeof value === "string" && value.toString().includes(" ")) {
      throw new Error("Username must not contain spaces.");
    }
    if (value === undefined || value === null || value === "") {
      throw new Error("Username is required.");
    }
    if (value.length < 3) {
      throw new Error("Username must be at least 3 characters long.");
    }
    if (value.length > 24) {
      throw new Error("Username cannot be longer than 24 characters.");
    }
    if (value !== value.toLowerCase()) {
      throw new Error("Username must be lowercase.");
    }
    return true;
  }),

  // Password Rules
  body("password").custom((value, { req }) => {
    if (typeof value === "string" && value.toString().includes(" ")) {
      throw new Error("Password must not contain spaces.");
    }
    if (value === undefined || value === null || value === "") {
      throw new Error("Password is required.");
    }
    if (value.length < 5) {
      throw new Error("Password must be at least 5 characters long.");
    }
    if (value.length > 50) {
      throw new Error("Password cannot be longer than 50 characters.");
    }
    return true;
  }),

  //body('passwordConfirmation').custom((value, { req }) => {
  //  if (value !== req.body.password) {
  //    throw new Error('Password confirmation does not match password');
  //  }
  //  return true;
  //}),
];

const loginRules = [body("username").exists().withMessage("Username is required"), body("password").exists().withMessage("Password is required")];

// Register endpoint
router.post("/register", registerLimiter, registerRules, async (req, res) => {
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

module.exports = router;
