import { useState, useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { booksAPI, shelvesAPI } from '../../utils/api';

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

// Shared by Library.jsx's quick-add modal and the Add page's "Enter
// Manually" method - one source of truth for the form rather than two
// maintained copies (see BACKLOG.md item 10).
const ManualAddForm = ({ onSuccess, onCancel, initialValues }) => {
  const [shelves, setShelves] = useState([]);
  const [newBook, setNewBook] = useState({ ...EMPTY_BOOK, ...initialValues });
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    shelvesAPI.getAll()
      .then((res) => setShelves(res.data.shelves))
      .catch(() => {
        // Shelf assignment is optional; adding a book without one still works.
      });
  }, []);

  const setField = (field) => (e) => setNewBook({ ...newBook, [field]: e.target.value });

  const handleSubmit = async (e) => {
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
      onSuccess?.();
    } catch (error) {
      console.error('Add book error:', error);
      const details = error.response?.data?.details?.[0]?.msg;
      setAddError(details || error.response?.data?.error || 'Failed to add book');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="manual-add-form">
      <div className="modal-header">
        <h2>Add a Book</h2>
        {onCancel && (
          <button className="btn-close" onClick={onCancel} aria-label="Close">
            <FaTimes />
          </button>
        )}
      </div>

      <p className="modal-intro">
        For books that scanning or search can&apos;t find. Only the title is required.
      </p>

      <form onSubmit={handleSubmit} className="modal-form">
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
  );
};

export default ManualAddForm;
