import express from 'express';
import { testGoogleBooks, testUpload } from '../controllers/testController.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Public test endpoints (no auth required for testing)
router.get('/google-books', testGoogleBooks);
router.post('/upload', upload.single('image'), testUpload);

export default router;
