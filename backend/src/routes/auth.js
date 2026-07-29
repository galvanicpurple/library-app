import express from 'express';
import {
  register,
  login,
  getProfile,
  updateProfile,
  updateEmail,
  updatePassword,
  updatePreferences
} from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  validateRegistration,
  validateLogin,
  validateEmailChange,
  validatePasswordChange,
} from '../middleware/validation.js';
import { authLimiter } from '../middleware/security.js';

const router = express.Router();

// Public routes (with rate limiting)
router.post('/register', authLimiter, validateRegistration, register);
router.post('/login', authLimiter, validateLogin, login);

// Protected routes
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
// Rate limited like login/register since these accept a password guess
router.put('/email', authLimiter, authenticateToken, validateEmailChange, updateEmail);
router.put('/password', authLimiter, authenticateToken, validatePasswordChange, updatePassword);
router.put('/preferences', authenticateToken, updatePreferences);

export default router;
