import { useState, useEffect } from 'react';
import { FaPlus, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { shelvesAPI } from '../utils/api';
import './Shelves.css';

const Shelves = () => {
  const [shelves, setShelves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newShelf, setNewShelf] = useState({ name: '', location: '' });
  const [saving, setSaving] = useState(false);

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

  const handleAddShelf = async (e) => {
    e.preventDefault();
    if (!newShelf.name.trim()) {
      toast.error('Shelf name is required');
      return;
    }

    setSaving(true);
    try {
      await shelvesAPI.create(newShelf);
      toast.success('Shelf created');
      setShowAddModal(false);
      setNewShelf({ name: '', location: '' });
      loadShelves();
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to create shelf';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shelves-container">
      <div className="container">
        <div className="shelves-header">
          <h1>My Shelves</h1>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <FaPlus /> Add Shelf
          </button>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
          </div>
        ) : shelves.length === 0 ? (
          <div className="empty-state">
            <p>No shelves yet. Add one to start organizing your books.</p>
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

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Shelf</h2>
              <button
                className="btn-close"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleAddShelf} className="modal-form">
              <div className="form-group">
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input"
                  value={newShelf.name}
                  onChange={(e) => setNewShelf({ ...newShelf, name: e.target.value })}
                  placeholder="e.g. Living Room Bookcase"
                  autoFocus
                  required
                />
              </div>

              <div className="form-group">
                <label className="label">Location (optional)</label>
                <input
                  type="text"
                  className="input"
                  value={newShelf.location}
                  onChange={(e) => setNewShelf({ ...newShelf, location: e.target.value })}
                  placeholder="e.g. Top shelf, second row"
                />
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
                {saving ? 'Creating...' : 'Create Shelf'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Shelves;
