import { useState, useEffect } from 'react';
import { FaPlus } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { shelvesAPI } from '../utils/api';
import './Shelves.css';

const Shelves = () => {
  const [shelves, setShelves] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadShelves();
  }, []);

  const loadShelves = async () => {
    try {
      const response = await shelvesAPI.getAll();
      setShelves(response.data.shelves);
    } catch (error) {
      toast.error('Failed to load shelves');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shelves-container">
      <div className="container">
        <div className="shelves-header">
          <h1>My Shelves</h1>
          <button className="btn btn-primary">
            <FaPlus /> Add Shelf
          </button>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
          </div>
        ) : (
          <div className="shelves-grid">
            {shelves.map((shelf) => (
              <div key={shelf.id} className="shelf-card">
                <h3>{shelf.name}</h3>
                {shelf.location && <p className="shelf-location">{shelf.location}</p>}
                <p className="shelf-count">{shelf.book_count} books</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Shelves;
