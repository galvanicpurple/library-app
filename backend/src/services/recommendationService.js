import { query } from '../db/db.js';

// Get personalized book recommendations
export const getRecommendations = async (userId, limit = 10) => {
  try {
    const recommendations = [];

    // 1. Books in series the user is reading
    const seriesRecommendations = await getSeriesRecommendations(userId);
    recommendations.push(...seriesRecommendations);

    // 2. Books by favorite authors
    const authorRecommendations = await getAuthorRecommendations(userId);
    recommendations.push(...authorRecommendations);

    // 3. Books in favorite genres
    const genreRecommendations = await getGenreRecommendations(userId);
    recommendations.push(...genreRecommendations);

    // 4. Unread books in library
    const unreadBooks = await getUnreadBooks(userId);
    recommendations.push(...unreadBooks);

    // Remove duplicates and limit results
    const uniqueRecommendations = removeDuplicates(recommendations);
    
    return uniqueRecommendations.slice(0, limit);
  } catch (error) {
    console.error('Get recommendations error:', error);
    throw error;
  }
};

// Find next books in series user is reading
const getSeriesRecommendations = async (userId) => {
  try {
    // Get books user has read with series info
    const result = await query(
      `SELECT DISTINCT 
        b.title, b.authors, b.categories
      FROM readings r
      JOIN books b ON r.book_id = b.id
      WHERE r.user_id = $1 
      AND r.status IN ('completed', 'currently_reading')
      AND (b.title ILIKE '%book%' OR b.title ~ '\\d+')`,
      [userId]
    );

    // For each series book, suggest next in series
    // This is simplified - in production, you'd use a more sophisticated series detection
    const recommendations = [];
    
    for (const book of result.rows) {
      // Extract series number if present
      const numberMatch = book.title.match(/\b(\d+)\b/);
      if (numberMatch) {
        const currentNumber = parseInt(numberMatch[1]);
        const nextNumber = currentNumber + 1;
        
        // Search for next book in user's library
        const nextBookResult = await query(
          `SELECT DISTINCT
            b.id, b.title, b.authors, b.image_url, b.categories, b.description,
            ub.id as user_book_id,
            COALESCE(r.status, 'unread') as reading_status
          FROM books b
          JOIN user_books ub ON b.id = ub.book_id
          LEFT JOIN readings r ON r.book_id = b.id AND r.user_id = $1
          WHERE ub.user_id = $1
          AND b.title ILIKE $2
          AND (r.status IS NULL OR r.status = 'want_to_read')
          LIMIT 1`,
          [userId, `%${nextNumber}%`]
        );

        if (nextBookResult.rows.length > 0) {
          recommendations.push({
            ...nextBookResult.rows[0],
            recommendationType: 'series_continuation',
            reason: `Next in series after "${book.title}"`,
          });
        }
      }
    }

    return recommendations;
  } catch (error) {
    console.error('Series recommendations error:', error);
    return [];
  }
};

// Recommend books by favorite authors
const getAuthorRecommendations = async (userId) => {
  try {
    // Find user's favorite authors (most read and highest rated)
    const favoriteAuthorsResult = await query(
      `SELECT 
        UNNEST(b.authors) as author,
        COUNT(*) as read_count,
        AVG(r.rating) as avg_rating
      FROM readings r
      JOIN books b ON r.book_id = b.id
      WHERE r.user_id = $1 
      AND r.status = 'completed'
      AND r.rating >= 4
      GROUP BY author
      ORDER BY avg_rating DESC, read_count DESC
      LIMIT 5`,
      [userId]
    );

    const recommendations = [];

    // For each favorite author, find unread books in user's library
    for (const authorData of favoriteAuthorsResult.rows) {
      const booksResult = await query(
        `SELECT DISTINCT
          b.id, b.title, b.authors, b.image_url, b.categories, b.description,
          ub.id as user_book_id,
          COALESCE(r.status, 'unread') as reading_status
        FROM books b
        JOIN user_books ub ON b.id = ub.book_id
        LEFT JOIN readings r ON r.book_id = b.id AND r.user_id = $1
        WHERE ub.user_id = $1
        AND $2 = ANY(b.authors)
        AND (r.status IS NULL OR r.status = 'want_to_read')
        LIMIT 2`,
        [userId, authorData.author]
      );

      for (const book of booksResult.rows) {
        recommendations.push({
          ...book,
          recommendationType: 'favorite_author',
          reason: `By ${authorData.author} (avg rating: ${Math.round(authorData.avg_rating * 10) / 10})`,
        });
      }
    }

    return recommendations;
  } catch (error) {
    console.error('Author recommendations error:', error);
    return [];
  }
};

// Recommend books in favorite genres
const getGenreRecommendations = async (userId) => {
  try {
    // Find user's favorite genres
    const favoriteGenresResult = await query(
      `SELECT 
        UNNEST(b.categories) as genre,
        COUNT(*) as read_count,
        AVG(r.rating) as avg_rating
      FROM readings r
      JOIN books b ON r.book_id = b.id
      WHERE r.user_id = $1 
      AND r.status = 'completed'
      AND r.rating >= 4
      GROUP BY genre
      ORDER BY avg_rating DESC, read_count DESC
      LIMIT 3`,
      [userId]
    );

    const recommendations = [];

    // For each favorite genre, find unread books
    for (const genreData of favoriteGenresResult.rows) {
      const booksResult = await query(
        `SELECT DISTINCT
          b.id, b.title, b.authors, b.image_url, b.categories, b.description,
          ub.id as user_book_id,
          COALESCE(r.status, 'unread') as reading_status
        FROM books b
        JOIN user_books ub ON b.id = ub.book_id
        LEFT JOIN readings r ON r.book_id = b.id AND r.user_id = $1
        WHERE ub.user_id = $1
        AND $2 = ANY(b.categories)
        AND (r.status IS NULL OR r.status = 'want_to_read')
        LIMIT 2`,
        [userId, genreData.genre]
      );

      for (const book of booksResult.rows) {
        recommendations.push({
          ...book,
          recommendationType: 'favorite_genre',
          reason: `${genreData.genre} (you rated similar books ${Math.round(genreData.avg_rating * 10) / 10}/5)`,
        });
      }
    }

    return recommendations;
  } catch (error) {
    console.error('Genre recommendations error:', error);
    return [];
  }
};

// Get unread books from library
const getUnreadBooks = async (userId) => {
  try {
    // No DISTINCT needed: the WHERE r.id IS NULL filter means the LEFT JOIN
    // can't fan out to multiple rows per ub.id, so rows are already unique.
    // (DISTINCT + ORDER BY ub.created_at would require created_at in the
    // select list, which Postgres rejects otherwise.)
    const result = await query(
      `SELECT
        b.id, b.title, b.authors, b.image_url, b.categories, b.description,
        ub.id as user_book_id,
        'unread' as reading_status
      FROM books b
      JOIN user_books ub ON b.id = ub.book_id
      LEFT JOIN readings r ON r.book_id = b.id AND r.user_id = $1
      WHERE ub.user_id = $1
      AND r.id IS NULL
      ORDER BY ub.created_at DESC
      LIMIT 5`,
      [userId]
    );

    return result.rows.map(book => ({
      ...book,
      recommendationType: 'unread',
      reason: 'From your library',
    }));
  } catch (error) {
    console.error('Unread books error:', error);
    return [];
  }
};

// Remove duplicate recommendations
const removeDuplicates = (recommendations) => {
  const seen = new Set();
  return recommendations.filter(rec => {
    if (seen.has(rec.id)) {
      return false;
    }
    seen.add(rec.id);
    return true;
  });
};

// Get reading insights
export const getReadingInsights = async (userId) => {
  try {
    // Most read genres
    const genresResult = await query(
      `SELECT 
        UNNEST(b.categories) as genre,
        COUNT(*) as count
      FROM readings r
      JOIN books b ON r.book_id = b.id
      WHERE r.user_id = $1 AND r.status = 'completed'
      GROUP BY genre
      ORDER BY count DESC
      LIMIT 5`,
      [userId]
    );

    // Most read authors
    const authorsResult = await query(
      `SELECT 
        UNNEST(b.authors) as author,
        COUNT(*) as count
      FROM readings r
      JOIN books b ON r.book_id = b.id
      WHERE r.user_id = $1 AND r.status = 'completed'
      GROUP BY author
      ORDER BY count DESC
      LIMIT 5`,
      [userId]
    );

    // Reading pace (books per month this year)
    const paceResult = await query(
      `SELECT COUNT(*) as books_completed
      FROM readings
      WHERE user_id = $1 
      AND status = 'completed'
      AND completed_at >= date_trunc('year', CURRENT_DATE)`,
      [userId]
    );

    const currentMonth = new Date().getMonth() + 1;
    const booksPerMonth = Math.round(paceResult.rows[0].books_completed / currentMonth * 10) / 10;

    return {
      favoriteGenres: genresResult.rows,
      favoriteAuthors: authorsResult.rows,
      readingPace: {
        booksCompletedThisYear: parseInt(paceResult.rows[0].books_completed),
        averagePerMonth: booksPerMonth,
      },
    };
  } catch (error) {
    console.error('Reading insights error:', error);
    throw error;
  }
};
