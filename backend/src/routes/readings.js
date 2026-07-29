import express from 'express';
import {
  getReading,
  getReadingsByStatus,
  getReadingStats,
  updateReading,
  deleteReading,
} from '../controllers/readingsController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateReading, validateUUID } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Reading management
router.get('/stats', getReadingStats);
router.get('/status/:status', getReadingsByStatus);
router.get('/:bookId', validateUUID('bookId'), getReading);
router.put('/:bookId', validateUUID('bookId'), validateReading, updateReading);
router.delete('/:bookId', validateUUID('bookId'), deleteReading);

export default router;
