import { query } from '../db/db.js';
import { scanShelfImage, manualBookSearch, searchByISBN } from '../services/bookRecognitionService.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Scan shelf image
export const scanShelf = async (req, res) => {
  try {
    const { shelfId } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Read uploaded image
    const imageBuffer = fs.readFileSync(req.file.path);

    // Scan image and identify books
    const scanResult = await scanShelfImage(imageBuffer);

    // Create scan session record
    const scanSessionResult = await query(
      `INSERT INTO scan_sessions (user_id, shelf_id, books_found, image_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, shelfId, scanResult.booksFound, req.file.path]
    );

    res.json({
      message: 'Shelf scanned successfully',
      scanSession: scanSessionResult.rows[0],
      ...scanResult,
    });
  } catch (error) {
    console.error('Scan shelf error:', error);
    res.status(500).json({ error: 'Failed to scan shelf', details: error.message });
  } finally {
    // Clean up uploaded file after processing (optional - keep for audit trail)
    // if (req.file) {
    //   fs.unlinkSync(req.file.path);
    // }
  }
};

// Search for a book (external API)
export const searchExternalBooks = async (req, res) => {
  try {
    const { query: searchQuery, type = 'general' } = req.query;

    if (!searchQuery) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    let books;

    if (type === 'isbn') {
      books = await searchByISBN(searchQuery);
    } else {
      books = await manualBookSearch(searchQuery);
    }

    res.json({
      books,
      total: books.length,
    });
  } catch (error) {
    console.error('External book search error:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
};

// Get scan history
export const getScanHistory = async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        ss.*,
        s.name as shelf_name
      FROM scan_sessions ss
      LEFT JOIN shelves s ON ss.shelf_id = s.id
      WHERE ss.user_id = $1
      ORDER BY ss.scanned_at DESC
      LIMIT 50`,
      [req.user.id]
    );

    res.json({
      scans: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get scan history error:', error);
    res.status(500).json({ error: 'Failed to fetch scan history' });
  }
};

// Batch add books from scan
export const batchAddBooks = async (req, res) => {
  try {
    const { books, shelfId } = req.body;

    if (!Array.isArray(books) || books.length === 0) {
      return res.status(400).json({ error: 'Books array is required' });
    }

    const addedBooks = [];
    const errors = [];

    for (const bookData of books) {
      try {
        // Check if book exists in catalog
        let bookResult = await query(
          'SELECT id FROM books WHERE isbn = $1 OR (title = $2 AND authors = $3)',
          [bookData.isbn, bookData.title, bookData.authors]
        );

        let bookId;

        if (bookResult.rows.length === 0) {
          // Add to catalog
          const newBook = await query(
            `INSERT INTO books (
              isbn, isbn13, title, subtitle, authors, publisher, published_date,
              description, page_count, categories, language, image_url, google_books_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id`,
            [
              bookData.isbn, bookData.isbn13, bookData.title, bookData.subtitle,
              bookData.authors, bookData.publisher, bookData.publishedDate,
              bookData.description, bookData.pageCount, bookData.categories,
              bookData.language, bookData.imageUrl, bookData.googleBooksId
            ]
          );
          bookId = newBook.rows[0].id;
        } else {
          bookId = bookResult.rows[0].id;
        }

        // Check if user already owns this book
        const existingUserBook = await query(
          'SELECT id FROM user_books WHERE user_id = $1 AND book_id = $2',
          [req.user.id, bookId]
        );

        const isDuplicate = existingUserBook.rows.length > 0;

        // Add to user's library
        const userBookResult = await query(
          `INSERT INTO user_books (user_id, book_id, shelf_id, is_duplicate)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [req.user.id, bookId, shelfId, isDuplicate]
        );

        addedBooks.push({
          ...bookData,
          userBookId: userBookResult.rows[0].id,
          isDuplicate,
        });
      } catch (error) {
        errors.push({
          book: bookData.title,
          error: error.message,
        });
      }
    }

    res.json({
      message: 'Books processed',
      addedBooks,
      errors,
      successCount: addedBooks.length,
      errorCount: errors.length,
    });
  } catch (error) {
    console.error('Batch add books error:', error);
    res.status(500).json({ error: 'Failed to add books' });
  }
};
