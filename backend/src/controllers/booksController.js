import { query, transaction } from '../db/db.js';

// Get all books for current user
export const getUserBooks = async (req, res) => {
  try {
    const { shelf_id, status, search } = req.query;
    
    let queryText = `
      SELECT 
        b.id, b.isbn, b.title, b.subtitle, b.authors, b.publisher,
        b.published_date, b.description, b.page_count, b.categories,
        b.image_url, b.language,
        ub.id as user_book_id, ub.shelf_id, ub.position_on_shelf,
        ub.acquisition_date, ub.condition, ub.notes, ub.is_duplicate,
        s.name as shelf_name, s.location as shelf_location,
        r.status as reading_status, r.rating, r.current_page, r.started_at, r.completed_at
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      LEFT JOIN shelves s ON ub.shelf_id = s.id
      LEFT JOIN readings r ON r.book_id = b.id AND r.user_id = ub.user_id
      WHERE ub.user_id = $1
    `;
    
    const params = [req.user.id];
    let paramCount = 1;
    
    if (shelf_id) {
      paramCount++;
      queryText += ` AND ub.shelf_id = $${paramCount}`;
      params.push(shelf_id);
    }
    
    if (status) {
      paramCount++;
      queryText += ` AND r.status = $${paramCount}`;
      params.push(status);
    }
    
    if (search) {
      paramCount++;
      queryText += ` AND (
        b.title ILIKE $${paramCount} OR 
        b.authors::text ILIKE $${paramCount} OR
        b.isbn ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }
    
    queryText += ' ORDER BY b.title';
    
    const result = await query(queryText, params);
    
    res.json({
      books: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get user books error:', error);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
};

// Get single book details
export const getBookById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `SELECT 
        b.*,
        ub.id as user_book_id, ub.shelf_id, ub.position_on_shelf,
        ub.acquisition_date, ub.condition, ub.notes, ub.is_duplicate,
        s.name as shelf_name, s.location as shelf_location,
        r.status as reading_status, r.rating, r.current_page, 
        r.started_at, r.completed_at, r.review
      FROM books b
      LEFT JOIN user_books ub ON b.id = ub.book_id AND ub.user_id = $1
      LEFT JOIN shelves s ON ub.shelf_id = s.id
      LEFT JOIN readings r ON r.book_id = b.id AND r.user_id = $1
      WHERE b.id = $2`,
      [req.user.id, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.json({ book: result.rows[0] });
  } catch (error) {
    console.error('Get book error:', error);
    res.status(500).json({ error: 'Failed to fetch book' });
  }
};

// Add book to user's library
export const addBook = async (req, res) => {
  try {
    const {
      isbn, isbn13, title, subtitle, authors, publisher, publishedDate,
      description, pageCount, categories, language, imageUrl, googleBooksId,
      shelfId, acquisitionDate, condition, notes
    } = req.body;

    await transaction(async (client) => {
      // Check if book exists in master catalog
      let bookResult = await client.query(
        'SELECT id FROM books WHERE isbn = $1 OR title = $2',
        [isbn, title]
      );

      let bookId;

      if (bookResult.rows.length === 0) {
        // Create new book in catalog
        const newBook = await client.query(
          `INSERT INTO books (
            isbn, isbn13, title, subtitle, authors, publisher, published_date,
            description, page_count, categories, language, image_url, google_books_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id`,
          [isbn, isbn13, title, subtitle, authors, publisher, publishedDate,
           description, pageCount, categories, language, imageUrl, googleBooksId]
        );
        bookId = newBook.rows[0].id;
      } else {
        bookId = bookResult.rows[0].id;
      }

      // Check if user already has this book
      const existingUserBook = await client.query(
        'SELECT id FROM user_books WHERE user_id = $1 AND book_id = $2',
        [req.user.id, bookId]
      );

      if (existingUserBook.rows.length > 0) {
        // Mark as duplicate if user already owns it
        await client.query(
          'UPDATE user_books SET is_duplicate = true WHERE id = $1',
          [existingUserBook.rows[0].id]
        );
      }

      // Add book to user's library
      const userBookResult = await client.query(
        `INSERT INTO user_books (
          user_id, book_id, shelf_id, acquisition_date, condition, notes, is_duplicate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [req.user.id, bookId, shelfId, acquisitionDate, condition, notes, 
         existingUserBook.rows.length > 0]
      );

      res.status(201).json({
        message: 'Book added successfully',
        userBook: userBookResult.rows[0],
        isDuplicate: existingUserBook.rows.length > 0,
      });
    });
  } catch (error) {
    console.error('Add book error:', error);
    res.status(500).json({ error: 'Failed to add book' });
  }
};

// Update user's book details
export const updateUserBook = async (req, res) => {
  try {
    const { id } = req.params;
    const { shelfId, positionOnShelf, condition, notes } = req.body;

    const result = await query(
      `UPDATE user_books 
       SET shelf_id = COALESCE($1, shelf_id),
           position_on_shelf = COALESCE($2, position_on_shelf),
           condition = COALESCE($3, condition),
           notes = COALESCE($4, notes)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [shelfId, positionOnShelf, condition, notes, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found in your library' });
    }

    res.json({
      message: 'Book updated successfully',
      userBook: result.rows[0],
    });
  } catch (error) {
    console.error('Update user book error:', error);
    res.status(500).json({ error: 'Failed to update book' });
  }
};

// Remove book from user's library
export const removeBook = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM user_books WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found in your library' });
    }

    res.json({ message: 'Book removed successfully' });
  } catch (error) {
    console.error('Remove book error:', error);
    res.status(500).json({ error: 'Failed to remove book' });
  }
};

// Search books (in user's library or externally)
export const searchBooks = async (req, res) => {
  try {
    const { q, source = 'library' } = req.query;

    if (source === 'library') {
      // Search in user's library
      const result = await query(
        `SELECT 
          b.id, b.isbn, b.title, b.authors, b.image_url,
          ub.id as user_book_id, ub.shelf_id,
          s.name as shelf_name, s.location as shelf_location
        FROM user_books ub
        JOIN books b ON ub.book_id = b.id
        LEFT JOIN shelves s ON ub.shelf_id = s.id
        WHERE ub.user_id = $1 AND (
          b.title ILIKE $2 OR 
          b.authors::text ILIKE $2 OR
          b.isbn ILIKE $2
        )
        ORDER BY b.title
        LIMIT 20`,
        [req.user.id, `%${q}%`]
      );

      res.json({ books: result.rows });
    } else {
      // External search handled by book recognition service
      res.json({ books: [], message: 'External search not yet implemented' });
    }
  } catch (error) {
    console.error('Search books error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};

// Get duplicate books
export const getDuplicates = async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        b.id, b.title, b.authors, b.image_url,
        COUNT(ub.id) as count,
        array_agg(json_build_object(
          'id', ub.id,
          'shelf_name', s.name,
          'condition', ub.condition,
          'acquisition_date', ub.acquisition_date
        )) as copies
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      LEFT JOIN shelves s ON ub.shelf_id = s.id
      WHERE ub.user_id = $1
      GROUP BY b.id, b.title, b.authors, b.image_url
      HAVING COUNT(ub.id) > 1
      ORDER BY b.title`,
      [req.user.id]
    );

    res.json({
      duplicates: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get duplicates error:', error);
    res.status(500).json({ error: 'Failed to fetch duplicates' });
  }
};
