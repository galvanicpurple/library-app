import { useState, useEffect, useRef } from 'react';
import { FaCamera, FaUpload, FaPencilAlt, FaCheck, FaPlus, FaExclamationCircle } from 'react-icons/fa';
import { toast } from 'react-toastify';
import CameraScanner from '../components/Camera/CameraScanner';
import PhotoUpload from '../components/Upload/PhotoUpload';
import ManualAddForm from '../components/Books/ManualAddForm';
import { scanAPI, shelvesAPI, booksAPI } from '../utils/api';
import './Add.css';

// Identifiers used to check whether a scanned book is already in the
// library: prefer ISBN (exact), fall back to a normalized title+author key
// for books without one.
const bookKey = (book) => {
  const isbn = book.isbn13 || book.isbn;
  if (isbn) return `isbn:${isbn}`;
  const title = (book.title || '').toLowerCase().trim();
  const author = (book.authors?.[0] || '').toLowerCase().trim();
  return `title:${title}|${author}`;
};

// Scanning a dense shelf takes 30-80+ seconds (OCR + Google Books matching),
// so the backend responds immediately with a scan session id and this page
// polls for the result rather than holding one request open the whole time.
const POLL_INTERVAL_MS = 2500;

const Add = () => {
  // One state machine instead of several independent booleans - camera,
  // upload, and manual entry are mutually exclusive, and barcode detection
  // (found while `view === 'camera'`) needs its own state too, so scattered
  // booleans would allow impossible combinations.
  const [view, setView] = useState('start');
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [shelves, setShelves] = useState([]);
  const [shelfId, setShelfId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addedIndexes, setAddedIndexes] = useState(new Set());
  const [ownedKeys, setOwnedKeys] = useState(new Set());

  // { status: 'looking-up' | 'found' | 'not-found' | 'adding', isbn, book? }
  const [barcodeState, setBarcodeState] = useState(null);
  const [manualPrefill, setManualPrefill] = useState(null);

  // Guards the poll loop's setState calls against firing after the user has
  // navigated away mid-scan (the backend job keeps running regardless -
  // this just stops a stray update to an unmounted page).
  const cancelledRef = useRef(false);
  useEffect(() => () => { cancelledRef.current = true; }, []);

  useEffect(() => {
    shelvesAPI.getAll()
      .then((res) => setShelves(res.data.shelves))
      .catch(() => {
        // Shelf selection is optional - if it fails to load, adding books
        // without a shelf assignment still works fine.
      });
  }, []);

  const pollScanStatus = async (scanSessionId) => {
    if (cancelledRef.current) return;

    let response;
    try {
      response = await scanAPI.getStatus(scanSessionId);
    } catch (error) {
      console.error('Scan status error:', error);
      if (!cancelledRef.current) {
        toast.error('Failed to check scan status');
        setView('start');
      }
      return;
    }

    if (cancelledRef.current) return;
    const data = response.data;

    if (data.status === 'processing') {
      setTimeout(() => pollScanStatus(scanSessionId), POLL_INTERVAL_MS);
      return;
    }

    if (data.status === 'failed') {
      toast.error(data.error || 'Scan failed');
      setView('start');
      return;
    }

    const libraryResponse = await booksAPI.getAll().catch(() => ({ data: { books: [] } }));
    if (cancelledRef.current) return;

    setResults(data);
    setSelected(new Set(data.books.map((_, i) => i)));
    setAddedIndexes(new Set());
    setOwnedKeys(new Set(libraryResponse.data.books.map(bookKey)));
    toast.success(`Found ${data.booksFound} books!`);
    setView('results');
  };

  const handleCapture = async (imageFile) => {
    setView('scanning');

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      const response = await scanAPI.scanShelf(formData);
      pollScanStatus(response.data.scanSessionId);
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Failed to start scan');
      setView('start');
    }
  };

  // Fires from CameraScanner's background barcode decode loop - a distinct,
  // single-book path from the manual-capture multi-book grid below.
  const handleBarcodeDetected = async (isbn) => {
    setBarcodeState({ status: 'looking-up', isbn });
    setView('barcode');

    try {
      const response = await scanAPI.searchExternal({ query: isbn, type: 'isbn' });
      const book = response.data.books?.[0];
      if (book) {
        setBarcodeState({ status: 'found', isbn, book });
      } else {
        setBarcodeState({ status: 'not-found', isbn });
      }
    } catch (error) {
      console.error('Barcode lookup error:', error);
      setBarcodeState({ status: 'not-found', isbn });
    }
  };

  const handleBarcodeAdd = async () => {
    if (!barcodeState?.book) return;
    setBarcodeState((prev) => ({ ...prev, status: 'adding' }));
    try {
      await scanAPI.batchAdd({ books: [barcodeState.book], shelfId: shelfId || null });
      toast.success(`Added "${barcodeState.book.title}"`);
      setBarcodeState(null);
      setView('camera');
    } catch (error) {
      console.error('Add scanned book error:', error);
      toast.error('Failed to add book');
      setBarcodeState((prev) => ({ ...prev, status: 'found' }));
    }
  };

  const handleBarcodeRetry = () => {
    setBarcodeState(null);
    setView('camera');
  };

  const handleBarcodeManual = () => {
    setManualPrefill({ isbn: barcodeState?.isbn || '' });
    setBarcodeState(null);
    setView('manual');
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
    setView('start');
  };

  return (
    <div className="scan-container">
      <div className="container">
        <h1>Add Books</h1>

        {view === 'start' && (
          <div className="scan-start">
            <p>Take a photo, upload one, scan a barcode, or enter a book by hand</p>
            <div className="method-buttons">
              <button className="btn btn-primary btn-large" onClick={() => setView('camera')}>
                <FaCamera /> Take Photo
              </button>
              <button className="btn btn-secondary btn-large" onClick={() => setView('upload')}>
                <FaUpload /> Upload Photo
              </button>
              <button className="btn btn-outline btn-large" onClick={() => setView('manual')}>
                <FaPencilAlt /> Enter Manually
              </button>
            </div>
            <p className="hint" style={{ marginTop: 16 }}>
              Point the camera at a barcode while taking a photo to add that exact book instantly.
            </p>
          </div>
        )}

        {view === 'scanning' && (
          <div className="scanning-state">
            <div className="spinner"></div>
            <p>Analyzing image and identifying books...</p>
            <p className="hint">This can take a minute or two for a full shelf.</p>
          </div>
        )}

        {view === 'barcode' && barcodeState && (
          <div className="barcode-confirm">
            {barcodeState.status === 'looking-up' && (
              <>
                <div className="spinner"></div>
                <p>Looking up ISBN {barcodeState.isbn}...</p>
              </>
            )}

            {(barcodeState.status === 'found' || barcodeState.status === 'adding') && (
              <div className="barcode-confirm-card">
                {barcodeState.book.imageUrl && (
                  <img src={barcodeState.book.imageUrl} alt={barcodeState.book.title} />
                )}
                <h3>{barcodeState.book.title}</h3>
                <p>{barcodeState.book.authors?.join(', ')}</p>
                <div className="barcode-confirm-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleBarcodeAdd}
                    disabled={barcodeState.status === 'adding'}
                  >
                    <FaPlus /> {barcodeState.status === 'adding' ? 'Adding...' : 'Add to Library'}
                  </button>
                  <button className="btn btn-outline" onClick={handleBarcodeRetry}>
                    Try Another
                  </button>
                </div>
              </div>
            )}

            {barcodeState.status === 'not-found' && (
              <div className="barcode-confirm-card">
                <p>No book found for ISBN {barcodeState.isbn}.</p>
                <div className="barcode-confirm-actions">
                  <button className="btn btn-primary" onClick={handleBarcodeManual}>
                    Enter Manually
                  </button>
                  <button className="btn btn-outline" onClick={handleBarcodeRetry}>
                    Try Another
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'results' && results && (
          <div className="scan-results">
            <h2>Found {results.booksFound} Books</h2>

            {results.books.length > 0 && (
              <div className="scan-add-bar">
                <div className="shelf-picker">
                  <label className="label" htmlFor="shelf-select">Assign to a shelf (optional)</label>
                  <select
                    id="shelf-select"
                    className="input"
                    value={shelfId}
                    onChange={(e) => setShelfId(e.target.value)}
                  >
                    <option value="">Don&apos;t assign to a shelf</option>
                    {shelves.map((shelf) => (
                      <option key={shelf.id} value={shelf.id}>{shelf.name}</option>
                    ))}
                  </select>
                  {shelves.length === 0 && (
                    <small className="hint">
                      Shelves group books by physical location (e.g. "Living Room Bookcase").
                      Create one on the Shelves page if you'd like to organize by location.
                    </small>
                  )}
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
                const alreadyOwned = !isAdded && ownedKeys.has(bookKey(book));
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
                    {alreadyOwned && (
                      <p className="already-owned-note">
                        <FaExclamationCircle /> Already in your library - adding will save another copy
                      </p>
                    )}
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

        {view === 'manual' && (
          <ManualAddForm
            initialValues={manualPrefill}
            onCancel={() => { setManualPrefill(null); setView('start'); }}
            onSuccess={() => { setManualPrefill(null); setView('start'); }}
          />
        )}
      </div>

      {view === 'camera' && (
        <CameraScanner
          onCapture={handleCapture}
          onBarcodeDetected={handleBarcodeDetected}
          onClose={() => setView('start')}
        />
      )}

      {view === 'upload' && (
        <PhotoUpload
          onCapture={handleCapture}
          onClose={() => setView('start')}
        />
      )}
    </div>
  );
};

export default Add;
