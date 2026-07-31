import { useState, useEffect, useMemo } from 'react';
import { FaSearch, FaTimes, FaTrash, FaPlus } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { booksAPI, readingsAPI } from '../utils/api';
import StarRating from '../components/StarRating';
import ManualAddForm from '../components/Books/ManualAddForm';
import './Library.css';

const READING_STATUSES = [
  { value: '', label: 'Not tracked' },
  { value: 'want_to_read', label: 'Want to read' },
  { value: 'currently_reading', label: 'Reading' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

const Library = () => {
  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [savingBookId, setSavingBookId] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);

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

  // Reading state is per book, not per copy, so every row for this book
  // has to be updated or the grouped card would show stale values.
  const patchBook = (bookId, changes) => {
    setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, ...changes } : b)));
  };

  const saveReading = async (book, { status, rating }) => {
    setSavingBookId(book.id);
    try {
      // rating is always sent explicitly (never omitted): the backend treats
      // an omitted rating as "leave it alone" and an explicit null as "clear
      // it", so a falsy 0 here (clicking the currently-selected star to unset
      // it) has to become null, not be left out of the request.
      await readingsAPI.update(book.id, { status, rating: rating || null });
      patchBook(book.id, { reading_status: status, rating: rating || null });
    } catch (error) {
      console.error('Update reading error:', error);
      toast.error(error.response?.data?.error || 'Failed to update reading status');
    } finally {
      setSavingBookId(null);
    }
  };

  const handleStatusChange = async (book, status) => {
    if (!status) {
      // "Not tracked" - drop the reading record entirely.
      setSavingBookId(book.id);
      try {
        await readingsAPI.remove(book.id);
        patchBook(book.id, { reading_status: null, rating: null });
      } catch (error) {
        console.error('Clear reading error:', error);
        toast.error('Failed to clear reading status');
      } finally {
        setSavingBookId(null);
      }
      return;
    }
    await saveReading(book, { status, rating: book.rating });
  };

  // Rating a book you never marked as read implies you finished it, and the
  // API requires a status on every write, so default to completed.
  const handleRatingChange = async (book, rating) => {
    await saveReading(book, { status: book.reading_status || 'completed', rating });
  };

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
          <div className="library-title-row">
            <h1>My Library</h1>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <FaPlus /> Add Book
            </button>
          </div>
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
            <p>
              {search
                ? 'No books match your search.'
                : 'No books yet. Scan your bookshelf, or add a book manually.'}
            </p>
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

                <div className="reading-controls">
                  <select
                    className="reading-status-select"
                    value={book.reading_status || ''}
                    onChange={(e) => handleStatusChange(book, e.target.value)}
                    disabled={savingBookId === book.id}
                    aria-label={`Reading status for ${book.title}`}
                  >
                    {READING_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <StarRating
                    value={book.rating || 0}
                    onChange={(rating) => handleRatingChange(book, rating)}
                    disabled={savingBookId === book.id}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <ManualAddForm
              onCancel={() => setShowAddModal(false)}
              onSuccess={() => { setShowAddModal(false); loadBooks(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Library;
