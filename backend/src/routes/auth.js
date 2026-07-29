import express from 'express';
import { 
  register, 
  login, 
  getProfile, 
  updateProfile, 
  updatePreferences 
} from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateRegistration, validateLogin } from '../middleware/validation.js';
import { authLimiter } from '../middleware/security.js';

const router = express.Router();

// Public routes (with rate limiting)
router.post('/register', authLimiter, validateRegistration, register);
router.post('/login', authLimiter, validateLogin, login);

// Protected routes
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.put('/preferences', authenticateToken, updatePreferences);

export default router;
