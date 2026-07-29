import { query } from '../db/db.js';

// Suggest optimal book organization
export const suggestOrganization = async (userId, method = 'genre') => {
  try {
    let organization = {};

    switch (method) {
      case 'genre':
        organization = await organizeByGenre(userId);
        break;
      case 'author':
        organization = await organizeByAuthor(userId);
        break;
      case 'alphabetical':
        organization = await organizeAlphabetically(userId);
        break;
      case 'series':
        organization = await organizeBySeries(userId);
        break;
      case 'reading_status':
        organization = await organizeByReadingStatus(userId);
        break;
      default:
        organization = await organizeByGenre(userId);
    }

    return organization;
  } catch (error) {
    console.error('Suggest organization error:', error);
    throw error;
  }
};

// Organize books by genre/category
const organizeByGenre = async (userId) => {
  try {
    const result = await query(
      `SELECT 
        b.id, b.title, b.authors, b.image_url,
        UNNEST(b.categories) as category,
        ub.id as user_book_id, ub.shelf_id
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = $1
      ORDER BY category, b.title`,
      [userId]
    );

    // Group by category
    const organized = {};
    for (const book of result.rows) {
      const category = book.category || 'Uncategorized';
      if (!organized[category]) {
        organized[category] = [];
      }
      organized[category].push(book);
    }

    // Sort categories by number of books (descending)
    const sortedCategories = Object.entries(organized)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([category, books], index) => ({
        category,
        books,
        count: books.length,
        suggestedShelfOrder: index + 1,
      }));

    return {
      method: 'genre',
      categories: sortedCategories,
      totalBooks: result.rows.length,
    };
  } catch (error) {
    console.error('Organize by genre error:', error);
    throw error;
  }
};

// Organize books by author
const organizeByAuthor = async (userId) => {
  try {
    const result = await query(
      `SELECT 
        b.id, b.title, b.authors, b.image_url,
        UNNEST(b.authors) as author,
        ub.id as user_book_id, ub.shelf_id
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = $1
      ORDER BY author, b.title`,
      [userId]
    );

    // Group by author
    const organized = {};
    for (const book of result.rows) {
      const author = book.author || 'Unknown';
      if (!organized[author]) {
        organized[author] = [];
      }
      organized[author].push(book);
    }

    // Sort authors alphabetically
    const sortedAuthors = Object.entries(organized)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([author, books], index) => ({
        author,
        books,
        count: books.length,
        suggestedShelfOrder: index + 1,
      }));

    return {
      method: 'author',
      authors: sortedAuthors,
      totalBooks: result.rows.length,
    };
  } catch (error) {
    console.error('Organize by author error:', error);
    throw error;
  }
};

// Organize books alphabetically
const organizeAlphabetically = async (userId) => {
  try {
    const result = await query(
      `SELECT 
        b.id, b.title, b.authors, b.image_url,
        UPPER(LEFT(b.title, 1)) as first_letter,
        ub.id as user_book_id, ub.shelf_id
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = $1
      ORDER BY b.title`,
      [userId]
    );

    // Group by first letter
    const organized = {};
    for (const book of result.rows) {
      const letter = /[A-Z]/.test(book.first_letter) ? book.first_letter : '#';
      if (!organized[letter]) {
        organized[letter] = [];
      }
      organized[letter].push(book);
    }

    // Sort letters
    const sortedLetters = Object.entries(organized)
      .sort((a, b) => {
        if (a[0] === '#') return 1;
        if (b[0] === '#') return -1;
        return a[0].localeCompare(b[0]);
      })
      .map(([letter, books], index) => ({
        letter,
        books,
        count: books.length,
        suggestedShelfOrder: index + 1,
      }));

    return {
      method: 'alphabetical',
      letters: sortedLetters,
      totalBooks: result.rows.length,
    };
  } catch (error) {
    console.error('Organize alphabetically error:', error);
    throw error;
  }
};

// Organize books by series
const organizeBySeries = async (userId) => {
  try {
    const result = await query(
      `SELECT 
        b.id, b.title, b.authors, b.image_url,
        ub.id as user_book_id, ub.shelf_id
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = $1
      ORDER BY b.title`,
      [userId]
    );

    // Detect series (simplified - looks for numbers or "Book" in title)
    const series = {};
    const standalone = [];

    for (const book of result.rows) {
      // Try to extract series name
      const seriesMatch = book.title.match(/^(.*?)\s*(?:Book|#|Volume|Vol\.?)\s*\d+/i);
      
      if (seriesMatch) {
        const seriesName = seriesMatch[1].trim();
        if (!series[seriesName]) {
          series[seriesName] = [];
        }
        series[seriesName].push(book);
      } else {
        standalone.push(book);
      }
    }

    const sortedSeries = Object.entries(series)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([seriesName, books], index) => ({
        seriesName,
        books: books.sort((a, b) => {
          // Sort by number in title
          const numA = parseInt(a.title.match(/\d+/)?.[0] || '0');
          const numB = parseInt(b.title.match(/\d+/)?.[0] || '0');
          return numA - numB;
        }),
        count: books.length,
        suggestedShelfOrder: index + 1,
      }));

    return {
      method: 'series',
      series: sortedSeries,
      standalone: standalone,
      totalBooks: result.rows.length,
    };
  } catch (error) {
    console.error('Organize by series error:', error);
    throw error;
  }
};

// Organize books by reading status
const organizeByReadingStatus = async (userId) => {
  try {
    const result = await query(
      `SELECT 
        b.id, b.title, b.authors, b.image_url,
        COALESCE(r.status, 'unread') as reading_status,
        ub.id as user_book_id, ub.shelf_id
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      LEFT JOIN readings r ON r.book_id = b.id AND r.user_id = ub.user_id
      WHERE ub.user_id = $1
      ORDER BY 
        CASE r.status
          WHEN 'currently_reading' THEN 1
          WHEN 'want_to_read' THEN 2
          WHEN 'completed' THEN 3
          WHEN 'abandoned' THEN 4
          ELSE 5
        END,
        b.title`,
      [userId]
    );

    // Group by status
    const organized = {
      currently_reading: [],
      want_to_read: [],
      unread: [],
      completed: [],
      abandoned: [],
    };

    for (const book of result.rows) {
      const status = book.reading_status || 'unread';
      if (organized[status]) {
        organized[status].push(book);
      }
    }

    const statusOrder = [
      'currently_reading',
      'want_to_read',
      'unread',
      'completed',
      'abandoned',
    ];

    const sortedStatuses = statusOrder
      .filter(status => organized[status].length > 0)
      .map((status, index) => ({
        status,
        displayName: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        books: organized[status],
        count: organized[status].length,
        suggestedShelfOrder: index + 1,
      }));

    return {
      method: 'reading_status',
      statuses: sortedStatuses,
      totalBooks: result.rows.length,
    };
  } catch (error) {
    console.error('Organize by reading status error:', error);
    throw error;
  }
};

// Apply organization suggestion to shelves
export const applyOrganization = async (userId, organizationData) => {
  try {
    const { method, assignments } = organizationData;
    
    // assignments format: [{ userBookId, shelfId, position }]
    for (const assignment of assignments) {
      await query(
        `UPDATE user_books 
         SET shelf_id = $1, position_on_shelf = $2
         WHERE id = $3 AND user_id = $4`,
        [assignment.shelfId, assignment.position, assignment.userBookId, userId]
      );
    }

    return {
      success: true,
      booksOrganized: assignments.length,
    };
  } catch (error) {
    console.error('Apply organization error:', error);
    throw error;
  }
};
