import { query } from '../db/db.js';
import { scanShelfImage, manualBookSearch, searchByISBN } from '../services/bookRecognitionService.js';
import fs from 'fs';

// Runs the actual OCR+matching pipeline after scanShelf has already
// responded - a full shelf scan can take 30-80+ seconds (OCR + Google Books
// matching), well past what's reasonable to hold one HTTP request open for.
// Not awaited by its caller; updates the scan_sessions row when done so
// getScanStatus has something to report.
const processScanJob = async (scanSessionId, imageBuffer) => {
  try {
    const scanResult = await scanShelfImage(imageBuffer);
    await query(
      `UPDATE scan_sessions SET status = 'completed', books_found = $1, result = $2 WHERE id = $3`,
      [scanResult.booksFound, JSON.stringify(scanResult), scanSessionId]
    );
  } catch (error) {
    console.error('Scan job error:', error);
    await query(
      `UPDATE scan_sessions SET status = 'failed', error = $1 WHERE id = $2`,
      [error.message, scanSessionId]
    ).catch((updateError) => {
      console.error('Failed to record scan job failure:', updateError);
    });
  }
};

// Scan shelf image
export const scanShelf = async (req, res) => {
  try {
    const { shelfId } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Read uploaded image now, while the temp file is still guaranteed to
    // exist - the actual OCR/matching happens later, detached from this
    // request.
    const imageBuffer = fs.readFileSync(req.file.path);

    // Create scan session record up front, in 'processing' state. image_url
    // is deliberately not set to req.file.path: Railway's filesystem is
    // ephemeral, so that local path stops existing on the next redeploy, and
    // nothing reads this column back today. Persisting it would just be
    // recording a path that's already known to go stale (backlog item 2).
    const scanSessionResult = await query(
      `INSERT INTO scan_sessions (user_id, shelf_id, books_found, image_url, status)
       VALUES ($1, $2, $3, $4, 'processing')
       RETURNING *`,
      [req.user.id, shelfId, 0, null]
    );
    const scanSession = scanSessionResult.rows[0];

    res.status(202).json({
      message: 'Scan started',
      scanSessionId: scanSession.id,
      status: 'processing',
    });

    // Not awaited - the response above has already gone out. The .catch
    // here only guards against processScanJob itself throwing unexpectedly
    // (it already handles its own errors internally and records them via
    // the 'failed' status), so a bug there can't become an unhandled
    // promise rejection.
    processScanJob(scanSession.id, imageBuffer).catch((error) => {
      console.error('Unexpected scan job failure:', error);
    });
  } catch (error) {
    console.error('Scan shelf error:', error);
    res.status(500).json({ error: 'Failed to scan shelf', details: error.message });
  }
};

// Poll the status/result of a scan started via scanShelf.
export const getScanStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT status, books_found, result, error FROM scan_sessions WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scan session not found' });
    }

    const row = result.rows[0];
    const scanResult = row.result || {};

    res.json({
      status: row.status,
      booksFound: row.books_found,
      books: scanResult.books || [],
      candidatesDetected: scanResult.candidatesDetected,
      extractedText: scanResult.extractedText,
      error: row.error,
    });
  } catch (error) {
    console.error('Get scan status error:', error);
    res.status(500).json({ error: 'Failed to fetch scan status' });
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
