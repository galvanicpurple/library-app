import { query } from '../db/db.js';

// Get reading status for a book
export const getReading = async (req, res) => {
  try {
    const { bookId } = req.params;

    const result = await query(
      `SELECT r.*, b.title, b.authors, b.image_url, b.page_count
       FROM readings r
       JOIN books b ON r.book_id = b.id
       WHERE r.user_id = $1 AND r.book_id = $2`,
      [req.user.id, bookId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reading record not found' });
    }

    res.json({ reading: result.rows[0] });
  } catch (error) {
    console.error('Get reading error:', error);
    res.status(500).json({ error: 'Failed to fetch reading' });
  }
};

// Get all readings by status
export const getReadingsByStatus = async (req, res) => {
  try {
    const { status } = req.params;

    const result = await query(
      `SELECT 
        r.*,
        b.id as book_id, b.title, b.authors, b.image_url, b.page_count, b.categories
      FROM readings r
      JOIN books b ON r.book_id = b.id
      WHERE r.user_id = $1 AND r.status = $2
      ORDER BY r.updated_at DESC`,
      [req.user.id, status]
    );

    res.json({
      readings: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get readings by status error:', error);
    res.status(500).json({ error: 'Failed to fetch readings' });
  }
};

// Get reading statistics
export const getReadingStats = async (req, res) => {
  try {
    const statsResult = await query(
      `SELECT 
        status,
        COUNT(*) as count,
        AVG(rating) as avg_rating
      FROM readings
      WHERE user_id = $1
      GROUP BY status`,
      [req.user.id]
    );

    const totalBooksResult = await query(
      'SELECT COUNT(*) as total FROM user_books WHERE user_id = $1',
      [req.user.id]
    );

    const completedThisYearResult = await query(
      `SELECT COUNT(*) as count
       FROM readings
       WHERE user_id = $1 
       AND status = 'completed'
       AND EXTRACT(YEAR FROM completed_at) = EXTRACT(YEAR FROM CURRENT_DATE)`,
      [req.user.id]
    );

    res.json({
      stats: statsResult.rows,
      totalBooks: parseInt(totalBooksResult.rows[0].total),
      completedThisYear: parseInt(completedThisYearResult.rows[0].count),
    });
  } catch (error) {
    console.error('Get reading stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// Create or update reading status
export const updateReading = async (req, res) => {
  try {
    const { bookId } = req.params;
    const { status, rating, review, currentPage } = req.body;

    // Check if book exists in user's library
    const bookCheck = await query(
      'SELECT id FROM user_books WHERE user_id = $1 AND book_id = $2',
      [req.user.id, bookId]
    );

    if (bookCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found in your library' });
    }

    // Check if reading record exists
    const existingReading = await query(
      'SELECT id FROM readings WHERE user_id = $1 AND book_id = $2',
      [req.user.id, bookId]
    );

    let result;

    if (existingReading.rows.length === 0) {
      // Create new reading record
      result = await query(
        `INSERT INTO readings (user_id, book_id, status, rating, review, current_page, started_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, 
           CASE WHEN $3 IN ('currently_reading', 'completed') THEN CURRENT_TIMESTAMP ELSE NULL END,
           CASE WHEN $3 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END
         )
         RETURNING *`,
        [req.user.id, bookId, status, rating, review, currentPage]
      );
    } else {
      // Update existing reading record
      result = await query(
        `UPDATE readings
         SET status = COALESCE($1, status),
             rating = COALESCE($2, rating),
             review = COALESCE($3, review),
             current_page = COALESCE($4, current_page),
             started_at = CASE 
               WHEN $1 IN ('currently_reading', 'completed') AND started_at IS NULL 
               THEN CURRENT_TIMESTAMP 
               ELSE started_at 
             END,
             completed_at = CASE 
               WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP 
               ELSE completed_at 
             END
         WHERE user_id = $5 AND book_id = $6
         RETURNING *`,
        [status, rating, review, currentPage, req.user.id, bookId]
      );
    }

    res.json({
      message: 'Reading status updated successfully',
      reading: result.rows[0],
    });
  } catch (error) {
    console.error('Update reading error:', error);
    res.status(500).json({ error: 'Failed to update reading status' });
  }
};

// Delete reading record
export const deleteReading = async (req, res) => {
  try {
    const { bookId } = req.params;

    const result = await query(
      'DELETE FROM readings WHERE user_id = $1 AND book_id = $2 RETURNING *',
      [req.user.id, bookId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reading record not found' });
    }

    res.json({ message: 'Reading record deleted successfully' });
  } catch (error) {
    console.error('Delete reading error:', error);
    res.status(500).json({ error: 'Failed to delete reading record' });
  }
};
