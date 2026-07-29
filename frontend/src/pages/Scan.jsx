import { useState } from 'react';
import { FaCamera } from 'react-icons/fa';
import { toast } from 'react-toastify';
import CameraScanner from '../components/Camera/CameraScanner';
import { scanAPI } from '../utils/api';
import './Scan.css';

const Scan = () => {
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);

  const handleCapture = async (imageFile) => {
    setShowCamera(false);
    setScanning(true);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);

      const response = await scanAPI.scanShelf(formData);
      setResults(response.data);
      toast.success(`Found ${response.data.booksFound} books!`);
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Failed to scan image');
    } finally {
      setScanning(false);
    }
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
            <div className="books-grid">
              {results.books.map((book, index) => (
                <div key={index} className="book-card">
                  {book.imageUrl && <img src={book.imageUrl} alt={book.title} />}
                  <h4>{book.title}</h4>
                  <p>{book.authors?.join(', ')}</p>
                </div>
              ))}
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
