import bcrypt from 'bcrypt';
import passport from 'passport';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User.js';

// Register a new user
export const registerValidation = [
  body('displayname').notEmpty().withMessage('Display name is required'),
  body('username').notEmpty().withMessage('Username is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('interests').optional().isArray().withMessage('Interests should be an array'),
];

export async function register(req, res) {
  console.log(req.body)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const { displayname, username, email, password, interests } = req.body;
    const registeredUser = await User.register(
      { displayname, username, email, interests },
      password
    );
    if (registeredUser) {
      await passport.authenticate('local', (err, user, info) => {
        if (err || !user) {
          return res.status(400).json({ msg: 'Registration failed.' });
        }
        req.logIn(user, (err) => {
          if (err) {
            return res.status(400).json({ msg: 'Registration failed.' });
          }
          return res.status(201).json({ user: registeredUser });
        });
      })(req, res);
    } else {
      res.status(400).json({ msg: 'Registration failed.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// A method to login a user and return their data
export const loginValidation = [
  body('email').notEmpty().withMessage('Email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    passport.authenticate(
      'local',
      { successReturnToOrRedirect: '/home', failureRedirect: '/' },
      (err, user, info) => {
        if (err || !user) {
          return res.status(400).json({ msg: info.message });
        }
        req.login(user, (err) => {
          if (err) {
            return res.status(400).json({ msg: 'Failed to login.' });
          }
          return res.status(200).json({ user });
        });
      }
    )(req, res);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// A method to logout a user
export async function logout(req, res) {
  try {
    if (req.isAuthenticated()) {
      req.logout((err) => {
        if (err) {
          return res.status(500).json({ msg: 'Logout failed.' });
        }
        res.status(200).json({ msg: 'Logout successful.' });
      });
    } else {
      res.status(400).json({ msg: 'You are not logged in.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}