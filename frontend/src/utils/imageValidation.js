// Shared by CameraScanner (upload fallback) and PhotoUpload (dedicated
// upload method) so the same file gets validated the same way regardless of
// which entry point it came through.
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const validateImageFile = (file) => {
  if (!file) return { valid: false, error: 'No file selected' };
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'Please select an image file' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Image too large. Maximum size is 10MB' };
  }
  return { valid: true, error: null };
};
