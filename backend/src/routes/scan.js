import express from 'express';
import {
  scanShelf,
  getScanStatus,
  searchExternalBooks,
  getScanHistory,
  batchAddBooks,
} from '../controllers/scanController.js';
import { authenticateToken } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { uploadLimiter, validateFileUpload } from '../middleware/security.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Scanning and external search
router.post('/shelf', uploadLimiter, upload.single('image'), validateFileUpload, scanShelf);
router.get('/status/:id', getScanStatus);
router.get('/search', searchExternalBooks);
router.get('/history', getScanHistory);
router.post('/batch', batchAddBooks);

export default router;
