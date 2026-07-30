import { useState, useEffect, useMemo } from 'react';
import { FaSearch, FaTimes, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { booksAPI } from '../utils/api';
import './Library.css';

const Library = () => {
  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    loadBooks();
  }, [search]);

  const loadBooks = async () => {
    try {
      setLoading(true);
      const params = search ? { search } : {};
      const response = await booksAPI.getAll(params);
      setBooks(response.data.books);
    } catch (error) {
      console.error('Load books error:', error);
      toast.error('Failed to load books');
    } finally {
      setLoading(false);
    }
  };

  // Owning multiple copies of the same book shows up as separate rows from
  // the API (one per user_books entry) - group them into a single card with
  // a quantity badge instead of showing duplicate cards side by side.
  const groupedBooks = useMemo(() => {
    const map = new Map();
    for (const book of books) {
      if (!map.has(book.id)) {
        map.set(book.id, { ...book, copies: [] });
      }
      map.get(book.id).copies.push({
        userBookId: book.user_book_id,
        shelfName: book.shelf_name,
      });
    }
    return Array.from(map.values());
  }, [books]);

  const handleRemove = async (group) => {
    const copyToRemove = group.copies[0];
    const confirmMessage = group.copies.length > 1
      ? `Remove one copy of "${group.title}"? You have ${group.copies.length} copies.`
      : `Remove "${group.title}" from your library?`;

    if (!window.confirm(confirmMessage)) return;

    setRemovingId(copyToRemove.userBookId);
    try {
      await booksAPI.remove(copyToRemove.userBookId);
      setBooks((prev) => prev.filter((b) => b.user_book_id !== copyToRemove.userBookId));
      toast.success('Removed from library');
    } catch (error) {
      console.error('Remove book error:', error);
      toast.error('Failed to remove book');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="library-container">
      <div className="container">
        <div className="library-header">
          <h1>My Library</h1>
          <div className="search-bar">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search books..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
            {search && (
              <button onClick={() => setSearch('')} className="clear-btn">
                <FaTimes />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
          </div>
        ) : groupedBooks.length === 0 ? (
          <div className="empty-state">
            <p>No books found. Start by scanning your bookshelf!</p>
          </div>
        ) : (
          <div className="books-grid">
            {groupedBooks.map((book) => (
              <div key={book.id} className="book-card library-book-card">
                <button
                  className="remove-book-btn"
                  onClick={() => handleRemove(book)}
                  disabled={removingId === book.copies[0].userBookId}
                  aria-label={`Remove ${book.title}`}
                  title="Remove from library"
                >
                  <FaTrash />
                </button>
                {book.copies.length > 1 && (
                  <span className="badge badge-primary copy-count-badge">
                    &times;{book.copies.length}
                  </span>
                )}
                {book.image_url && (
                  <img src={book.image_url} alt={book.title} className="book-cover" />
                )}
                <div className="book-info">
                  <h3>{book.title}</h3>
                  <p className="book-authors">{book.authors?.join(', ')}</p>
                  {book.shelf_name && (
                    <span className="badge badge-secondary">{book.shelf_name}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Library;
