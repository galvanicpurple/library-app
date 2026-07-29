import express from 'express';
import {
  getUserBooks,
  getBookById,
  addBook,
  updateUserBook,
  removeBook,
  searchBooks,
  getDuplicates,
} from '../controllers/booksController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateBook, validateUUID } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Book management
router.get('/', getUserBooks);
router.get('/duplicates', getDuplicates);
router.get('/search', searchBooks);
router.get('/:id', validateUUID('id'), getBookById);
router.post('/', validateBook, addBook);
router.put('/:id', validateUUID('id'), updateUserBook);
router.delete('/:id', validateUUID('id'), removeBook);

export default router;
