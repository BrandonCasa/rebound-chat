// Required packages
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const logger = require('../index');

// Create express router
const router = express.Router();

// User model
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  displayName: { type: String, required: true },
}));

// Validation rules
const registerRules = [
  body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters long'),
  body('password').isLength({ min: 5 }).withMessage('Password must be at least 5 characters long'),
  body('displayName').isLength({ min: 1 }).withMessage('Display name is required'),
];

const loginRules = [
  body('username').exists().withMessage('Username is required'),
  body('password').exists().withMessage('Password is required'),
];

// Register endpoint
router.post('/register', registerRules, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, displayName } = req.body;

    // Check if user already exists
    let user = await User.findOne({ username: username });
    if (user) return res.status(400).json({ errors: [{ msg: 'User already exists.' }] });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    user = new User({
      username: username.toLowerCase(),
      password: hashedPassword,
      displayName: displayName,
    });

    // Save user
    await user.save();
    res.send('User registered successfully.');
  } catch (error) {
    logger.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Login endpoint
router.post('/login', loginRules, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Find user
    const user = await User.findOne({ username: username });
    if (!user) return res.status(400).json({ errors: [{ msg: 'Invalid username or password.' }] });

    // Validate password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ errors: [{ msg: 'Invalid username or password.' }] });

    // Create and assign a token
    const token = jwt.sign({ _id: user._id }, process.env.SECRET, { expiresIn: '1h' });
    res.header('auth-token', token).send(token);
  } catch (error) {
    logger.error(error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;