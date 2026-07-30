import { useState, useEffect, useMemo } from 'react';
import { FaSearch, FaTimes, FaTrash, FaPlus } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { booksAPI, readingsAPI, shelvesAPI } from '../utils/api';
import StarRating from '../components/StarRating';
import './Library.css';

const READING_STATUSES = [
  { value: '', label: 'Not tracked' },
  { value: 'want_to_read', label: 'Want to read' },
  { value: 'currently_reading', label: 'Reading' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

const EMPTY_BOOK = {
  title: '',
  authors: '',
  isbn: '',
  publisher: '',
  publishedDate: '',
  pageCount: '',
  categories: '',
  shelfId: '',
  notes: '',
};

// "1, 2 ,3" -> ['1','2','3'], and an empty string to undefined so the API
// stores NULL rather than an array containing one empty string.
const toArray = (text) => {
  const items = text.split(',').map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
};

const Library = () => {
  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [savingBookId, setSavingBookId] = useState(null);

  const [shelves, setShelves] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBook, setNewBook] = useState(EMPTY_BOOK);
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadBooks();
  }, [search]);

  useEffect(() => {
    shelvesAPI.getAll()
      .then((res) => setShelves(res.data.shelves))
      .catch(() => {
        // Shelf assignment is optional; adding a book without one still works.
      });
  }, []);

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

  const handleAddBook = async (e) => {
    e.preventDefault();
    setAddError('');

    if (!newBook.title.trim()) {
      setAddError('Title is required');
      return;
    }

    setSaving(true);
    try {
      await booksAPI.add({
        title: newBook.title.trim(),
        authors: toArray(newBook.authors),
        isbn: newBook.isbn.trim() || undefined,
        publisher: newBook.publisher.trim() || undefined,
        publishedDate: newBook.publishedDate.trim() || undefined,
        pageCount: newBook.pageCount ? Number(newBook.pageCount) : undefined,
        categories: toArray(newBook.categories),
        shelfId: newBook.shelfId || undefined,
        notes: newBook.notes.trim() || undefined,
      });

      toast.success(`Added "${newBook.title.trim()}"`);
      setShowAddModal(false);
      setNewBook(EMPTY_BOOK);
      loadBooks();
    } catch (error) {
      console.error('Add book error:', error);
      const details = error.response?.data?.details?.[0]?.msg;
      setAddError(details || error.response?.data?.error || 'Failed to add book');
    } finally {
      setSaving(false);
    }
  };

  const setField = (field) => (e) => setNewBook({ ...newBook, [field]: e.target.value });

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
            <div className="modal-header">
              <h2>Add a Book</h2>
              <button
                className="btn-close"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            <p className="modal-intro">
              For books that scanning or search can&apos;t find. Only the title is required.
            </p>

            <form onSubmit={handleAddBook} className="modal-form">
              {addError && <div className="form-error">{addError}</div>}

              <div className="form-group">
                <label className="label" htmlFor="mb-title">Title *</label>
                <input
                  id="mb-title"
                  className="input"
                  value={newBook.title}
                  onChange={setField('title')}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group">
                <label className="label" htmlFor="mb-authors">Author(s)</label>
                <input
                  id="mb-authors"
                  className="input"
                  value={newBook.authors}
                  onChange={setField('authors')}
                  placeholder="Separate multiple authors with commas"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="label" htmlFor="mb-isbn">ISBN</label>
                  <input
                    id="mb-isbn"
                    className="input"
                    value={newBook.isbn}
                    onChange={setField('isbn')}
                    placeholder="10 or 13 digits"
                  />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="mb-pages">Pages</label>
                  <input
                    id="mb-pages"
                    type="number"
                    min="1"
                    className="input"
                    value={newBook.pageCount}
                    onChange={setField('pageCount')}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="label" htmlFor="mb-publisher">Publisher</label>
                  <input
                    id="mb-publisher"
                    className="input"
                    value={newBook.publisher}
                    onChange={setField('publisher')}
                  />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="mb-published">Published</label>
                  <input
                    id="mb-published"
                    className="input"
                    value={newBook.publishedDate}
                    onChange={setField('publishedDate')}
                    placeholder="e.g. 1954"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="label" htmlFor="mb-categories">Genres</label>
                <input
                  id="mb-categories"
                  className="input"
                  value={newBook.categories}
                  onChange={setField('categories')}
                  placeholder="Separate with commas"
                />
              </div>

              <div className="form-group">
                <label className="label" htmlFor="mb-shelf">Shelf</label>
                <select
                  id="mb-shelf"
                  className="input"
                  value={newBook.shelfId}
                  onChange={setField('shelfId')}
                >
                  <option value="">Don&apos;t assign to a shelf</option>
                  {shelves.map((shelf) => (
                    <option key={shelf.id} value={shelf.id}>{shelf.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="label" htmlFor="mb-notes">Notes</label>
                <input
                  id="mb-notes"
                  className="input"
                  value={newBook.notes}
                  onChange={setField('notes')}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
                {saving ? 'Adding...' : 'Add to Library'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Library;
