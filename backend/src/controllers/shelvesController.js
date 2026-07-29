import { query } from '../db/db.js';

// Get all shelves for current user
export const getShelves = async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        s.*,
        COUNT(ub.id) as book_count
      FROM shelves s
      LEFT JOIN user_books ub ON s.id = ub.shelf_id
      WHERE s.user_id = $1
      GROUP BY s.id
      ORDER BY s.display_order, s.name`,
      [req.user.id]
    );

    res.json({
      shelves: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get shelves error:', error);
    res.status(500).json({ error: 'Failed to fetch shelves' });
  }
};

// Get single shelf with books
export const getShelfById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get shelf details
    const shelfResult = await query(
      `SELECT s.*, COUNT(ub.id) as book_count
       FROM shelves s
       LEFT JOIN user_books ub ON s.id = ub.shelf_id
       WHERE s.id = $1 AND s.user_id = $2
       GROUP BY s.id`,
      [id, req.user.id]
    );

    if (shelfResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shelf not found' });
    }

    // Get books on this shelf
    const booksResult = await query(
      `SELECT 
        b.id, b.isbn, b.title, b.authors, b.image_url, b.categories,
        ub.id as user_book_id, ub.position_on_shelf, ub.condition,
        r.status as reading_status
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      LEFT JOIN readings r ON r.book_id = b.id AND r.user_id = ub.user_id
      WHERE ub.shelf_id = $1 AND ub.user_id = $2
      ORDER BY ub.position_on_shelf, b.title`,
      [id, req.user.id]
    );

    res.json({
      shelf: shelfResult.rows[0],
      books: booksResult.rows,
    });
  } catch (error) {
    console.error('Get shelf error:', error);
    res.status(500).json({ error: 'Failed to fetch shelf' });
  }
};

// Create new shelf
export const createShelf = async (req, res) => {
  try {
    const { name, location, description, displayOrder } = req.body;

    const result = await query(
      `INSERT INTO shelves (user_id, name, location, description, display_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, name, location, description, displayOrder || 0]
    );

    res.status(201).json({
      message: 'Shelf created successfully',
      shelf: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Shelf with this name already exists' });
    }
    console.error('Create shelf error:', error);
    res.status(500).json({ error: 'Failed to create shelf' });
  }
};

// Update shelf
export const updateShelf = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, description, displayOrder } = req.body;

    const result = await query(
      `UPDATE shelves
       SET name = COALESCE($1, name),
           location = COALESCE($2, location),
           description = COALESCE($3, description),
           display_order = COALESCE($4, display_order)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name, location, description, displayOrder, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shelf not found' });
    }

    res.json({
      message: 'Shelf updated successfully',
      shelf: result.rows[0],
    });
  } catch (error) {
    console.error('Update shelf error:', error);
    res.status(500).json({ error: 'Failed to update shelf' });
  }
};

// Delete shelf
export const deleteShelf = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if shelf has books
    const booksCheck = await query(
      'SELECT COUNT(*) as count FROM user_books WHERE shelf_id = $1',
      [id]
    );

    if (parseInt(booksCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete shelf with books. Please move or remove books first.' 
      });
    }

    const result = await query(
      'DELETE FROM shelves WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shelf not found' });
    }

    res.json({ message: 'Shelf deleted successfully' });
  } catch (error) {
    console.error('Delete shelf error:', error);
    res.status(500).json({ error: 'Failed to delete shelf' });
  }
};

// Reorder shelves
export const reorderShelves = async (req, res) => {
  try {
    const { shelfOrders } = req.body; // Array of { id, displayOrder }

    // Update display orders
    for (const { id, displayOrder } of shelfOrders) {
      await query(
        'UPDATE shelves SET display_order = $1 WHERE id = $2 AND user_id = $3',
        [displayOrder, id, req.user.id]
      );
    }

    res.json({ message: 'Shelves reordered successfully' });
  } catch (error) {
    console.error('Reorder shelves error:', error);
    res.status(500).json({ error: 'Failed to reorder shelves' });
  }
};
