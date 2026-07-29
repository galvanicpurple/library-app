import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { FaCamera, FaTimes, FaUpload } from 'react-icons/fa';
import { toast } from 'react-toastify';
import './CameraScanner.css';

const CameraScanner = ({ onCapture, onClose }) => {
  const [hasPermission, setHasPermission] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const webcamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Request camera permission on mount
  useEffect(() => {
    requestCameraPermission();
  }, []);

  // Get available camera devices
  const handleDevices = useCallback(
    (mediaDevices) => {
      const videoDevices = mediaDevices.filter(
        ({ kind }) => kind === 'videoinput'
      );
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDevice) {
        setSelectedDevice(videoDevices[0].deviceId);
      }
    },
    [selectedDevice]
  );

  useEffect(() => {
    if (hasPermission) {
      navigator.mediaDevices.enumerateDevices().then(handleDevices);
    }
  }, [hasPermission, handleDevices]);

  // Request camera permission with security checks
  const requestCameraPermission = async () => {
    try {
      // Check if we're in a secure context (HTTPS or localhost)
      if (!window.isSecureContext) {
        toast.error('Camera access requires HTTPS or localhost');
        setHasPermission(false);
        return;
      }

      // Request permission
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Prefer back camera on mobile
      });

      // Permission granted
      setHasPermission(true);
      
      // Stop the stream immediately - we'll request it again when needed
      stream.getTracks().forEach(track => track.stop());

      toast.success('Camera access granted');
    } catch (error) {
      console.error('Camera permission error:', error);
      
      if (error.name === 'NotAllowedError') {
        toast.error('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (error.name === 'NotFoundError') {
        toast.error('No camera found on this device.');
      } else if (error.name === 'NotSupportedError') {
        toast.error('Camera not supported. Please use HTTPS or localhost.');
      } else {
        toast.error('Failed to access camera: ' + error.message);
      }
      
      setHasPermission(false);
    }
  };

  // Capture image from webcam
  const captureImage = useCallback(() => {
    if (!webcamRef.current) return;

    setIsCapturing(true);
    
    try {
      const imageSrc = webcamRef.current.getScreenshot();
      
      if (!imageSrc) {
        toast.error('Failed to capture image');
        setIsCapturing(false);
        return;
      }

      // Convert base64 to blob
      fetch(imageSrc)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], 'shelf-scan.jpg', { type: 'image/jpeg' });
          onCapture(file);
        })
        .catch(error => {
          console.error('Capture error:', error);
          toast.error('Failed to process image');
        })
        .finally(() => {
          setIsCapturing(false);
        });
    } catch (error) {
      console.error('Capture error:', error);
      toast.error('Failed to capture image');
      setIsCapturing(false);
    }
  }, [onCapture]);

  // Handle file upload as alternative
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Image too large. Maximum size is 10MB');
      return;
    }

    onCapture(file);
  };

  // Switch camera (front/back on mobile)
  const switchCamera = () => {
    const currentIndex = devices.findIndex(d => d.deviceId === selectedDevice);
    const nextIndex = (currentIndex + 1) % devices.length;
    setSelectedDevice(devices[nextIndex].deviceId);
  };

  // Render permission denied message
  if (hasPermission === false) {
    return (
      <div className="camera-scanner">
        <div className="camera-header">
          <h3>Camera Access</h3>
          <button className="btn-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="camera-body">
          <div className="permission-denied">
            <p>Camera permission is required to scan bookshelves.</p>
            <p>Please allow camera access in your browser settings and try again.</p>
            <button className="btn btn-primary" onClick={requestCameraPermission}>
              Request Permission Again
            </button>
            <div className="alternative">
              <p>Or upload an image instead:</p>
              <button 
                className="btn btn-secondary" 
                onClick={() => fileInputRef.current?.click()}
              >
                <FaUpload /> Upload Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render loading state
  if (hasPermission === null) {
    return (
      <div className="camera-scanner">
        <div className="camera-header">
          <h3>Camera Access</h3>
          <button className="btn-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="camera-body">
          <div className="loading">
            <div className="spinner"></div>
            <p>Requesting camera access...</p>
          </div>
        </div>
      </div>
    );
  }

  // Render camera view
  return (
    <div className="camera-scanner">
      <div className="camera-header">
        <h3>Scan Your Bookshelf</h3>
        <button className="btn-close" onClick={onClose}>
          <FaTimes />
        </button>
      </div>
      
      <div className="camera-body">
        <div className="webcam-container">
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              deviceId: selectedDevice,
              facingMode: 'environment',
              // Without explicit ideals, browsers often default to a low
              // resolution (e.g. 720p) - nowhere near enough detail to read
              // small book-spine text. Request the camera's max and let it
              // fall back gracefully on devices that can't hit this.
              width: { ideal: 4096 },
              height: { ideal: 2160 },
            }}
            className="webcam"
          />
          
          <div className="camera-overlay">
            <div className="scan-guide">
              <p>Position your bookshelf within the frame</p>
            </div>
          </div>
        </div>

        <div className="camera-controls">
          {devices.length > 1 && (
            <button className="btn btn-outline" onClick={switchCamera}>
              Switch Camera
            </button>
          )}
          
          <button 
            className="btn btn-primary" 
            onClick={captureImage}
            disabled={isCapturing}
          >
            <FaCamera /> {isCapturing ? 'Processing...' : 'Capture'}
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={() => fileInputRef.current?.click()}
          >
            <FaUpload /> Upload
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>

        <div className="privacy-notice">
          <p>🔒 Your privacy is protected. Images are processed securely and not stored permanently.</p>
        </div>
      </div>
    </div>
  );
};

export default CameraScanner;
