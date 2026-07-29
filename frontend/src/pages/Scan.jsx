import { useState, useEffect } from 'react';
import { FaCamera, FaCheck, FaPlus } from 'react-icons/fa';
import { toast } from 'react-toastify';
import CameraScanner from '../components/Camera/CameraScanner';
import { scanAPI, shelvesAPI } from '../utils/api';
import './Scan.css';

const Scan = () => {
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [shelves, setShelves] = useState([]);
  const [shelfId, setShelfId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addedIndexes, setAddedIndexes] = useState(new Set());

  useEffect(() => {
    shelvesAPI.getAll()
      .then((res) => setShelves(res.data.shelves))
      .catch(() => {
        // Shelf selection is optional - if it fails to load, adding books
        // without a shelf assignment still works fine.
      });
  }, []);

  const handleCapture = async (imageFile) => {
    setShowCamera(false);
    setScanning(true);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);

      const response = await scanAPI.scanShelf(formData);
      setResults(response.data);
      setSelected(new Set(response.data.books.map((_, i) => i)));
      setAddedIndexes(new Set());
      toast.success(`Found ${response.data.booksFound} books!`);
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Failed to scan image');
    } finally {
      setScanning(false);
    }
  };

  const toggleSelected = (index) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleAddToLibrary = async () => {
    const booksToAdd = results.books.filter((_, i) => selected.has(i));
    if (booksToAdd.length === 0) {
      toast.error('Select at least one book to add');
      return;
    }

    setAdding(true);
    try {
      const response = await scanAPI.batchAdd({
        books: booksToAdd,
        shelfId: shelfId || null,
      });

      setAddedIndexes(new Set(results.books.map((_, i) => i).filter((i) => selected.has(i))));

      const duplicateCount = response.data.addedBooks.filter((b) => b.isDuplicate).length;
      const newCount = response.data.successCount - duplicateCount;

      if (response.data.errorCount > 0) {
        toast.error(`Added ${newCount} books, but ${response.data.errorCount} failed`);
      } else if (duplicateCount > 0) {
        toast.success(`Added ${newCount} new books (${duplicateCount} were already in your library)`);
      } else {
        toast.success(`Added ${newCount} books to your library`);
      }
    } catch (error) {
      console.error('Add to library error:', error);
      toast.error('Failed to add books to your library');
    } finally {
      setAdding(false);
    }
  };

  const startOver = () => {
    setResults(null);
    setSelected(new Set());
    setAddedIndexes(new Set());
  };

  return (
    <div className="scan-container">
      <div className="container">
        <h1>Scan Your Bookshelf</h1>

        {!showCamera && !scanning && !results && (
          <div className="scan-start">
            <p>Use your camera to scan your bookshelf and automatically identify books</p>
            <button
              className="btn btn-primary btn-large"
              onClick={() => setShowCamera(true)}
            >
              <FaCamera /> Start Scanning
            </button>
          </div>
        )}

        {scanning && (
          <div className="scanning-state">
            <div className="spinner"></div>
            <p>Analyzing image and identifying books...</p>
          </div>
        )}

        {results && (
          <div className="scan-results">
            <h2>Found {results.booksFound} Books</h2>

            {results.books.length > 0 && (
              <div className="scan-add-bar">
                <div className="shelf-picker">
                  <label className="label" htmlFor="shelf-select">Add to shelf (optional)</label>
                  <select
                    id="shelf-select"
                    className="input"
                    value={shelfId}
                    onChange={(e) => setShelfId(e.target.value)}
                  >
                    <option value="">No shelf</option>
                    {shelves.map((shelf) => (
                      <option key={shelf.id} value={shelf.id}>{shelf.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleAddToLibrary}
                  disabled={adding || selected.size === 0}
                >
                  <FaPlus /> {adding ? 'Adding...' : `Add ${selected.size} to Library`}
                </button>
              </div>
            )}

            <div className="books-grid">
              {results.books.map((book, index) => {
                const isAdded = addedIndexes.has(index);
                return (
                  <div
                    key={index}
                    className={`book-card scan-book-card${selected.has(index) ? ' selected' : ''}`}
                    onClick={() => !isAdded && toggleSelected(index)}
                  >
                    {!isAdded && (
                      <input
                        type="checkbox"
                        className="scan-book-checkbox"
                        checked={selected.has(index)}
                        onChange={() => toggleSelected(index)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {isAdded && (
                      <span className="badge badge-secondary scan-added-badge">
                        <FaCheck /> Added
                      </span>
                    )}
                    {book.imageUrl && <img src={book.imageUrl} alt={book.title} />}
                    <h4>{book.title}</h4>
                    <p>{book.authors?.join(', ')}</p>
                  </div>
                );
              })}
            </div>

            <div className="scan-results-footer">
              <button className="btn btn-outline" onClick={startOver}>
                Scan Another Photo
              </button>
            </div>
          </div>
        )}
      </div>

      {showCamera && (
        <CameraScanner
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
};

export default Scan;
