import { useState, useEffect } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { booksAPI } from '../utils/api';
import './Library.css';

const Library = () => {
  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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
        ) : books.length === 0 ? (
          <div className="empty-state">
            <p>No books found. Start by scanning your bookshelf!</p>
          </div>
        ) : (
          <div className="books-grid">
            {books.map((book) => (
              <div key={book.id} className="book-card">
                {book.image_url && (
                  <img src={book.image_url} alt={book.title} className="book-cover" />
                )}
                <div className="book-info">
                  <h3>{book.title}</h3>
                  <p className="book-authors">{book.authors?.join(', ')}</p>
                  {book.shelf_name && (
                    <span className="badge badge-secondary">{book.shelf_name}</span>
                  )}
                  {book.is_duplicate && (
                    <span className="badge badge-warning">Duplicate</span>
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
