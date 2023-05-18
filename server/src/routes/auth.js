import express from 'express';
import { login, logout, register } from '../controllers/auth.js';
import verifyToken from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register); // (POST) /auth/register
router.post('/login', login); // (POST) /auth/login
router.post('/logout', logout); // (POST) /auth/logout

export default router;
// test xd