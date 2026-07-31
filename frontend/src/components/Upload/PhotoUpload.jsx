import { useRef } from 'react';
import { FaTimes, FaUpload } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { validateImageFile } from '../../utils/imageValidation';
import './PhotoUpload.css';

// No camera code path at all - deliberately separate from CameraScanner so
// choosing "Upload Photo" never triggers a getUserMedia permission prompt.
const PhotoUpload = ({ onCapture, onClose }) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    const { valid, error } = validateImageFile(file);
    if (!valid) {
      toast.error(error);
      return;
    }
    onCapture(file);
  };

  return (
    <div className="photo-upload">
      <div className="photo-upload-header">
        <h3>Upload a Photo</h3>
        <button className="photo-upload-close" onClick={onClose}>
          <FaTimes />
        </button>
      </div>
      <div className="photo-upload-body">
        <p>Choose a photo of your bookshelf, a single spine, or a cover.</p>
        <button className="btn btn-primary btn-large" onClick={() => fileInputRef.current?.click()}>
          <FaUpload /> Choose Photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
};

export default PhotoUpload;
