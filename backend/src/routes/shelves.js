import express from 'express';
import {
  getShelves,
  getShelfById,
  createShelf,
  updateShelf,
  deleteShelf,
  reorderShelves,
} from '../controllers/shelvesController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateShelf, validateUUID } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Shelf management
router.get('/', getShelves);
router.get('/:id', validateUUID('id'), getShelfById);
router.post('/', validateShelf, createShelf);
router.put('/:id', validateUUID('id'), updateShelf);
router.delete('/:id', validateUUID('id'), deleteShelf);
router.post('/reorder', reorderShelves);

export default router;
