import { manualBookSearch } from '../services/bookRecognitionService.js';

// Test endpoint to verify Google Books API
export const testGoogleBooks = async (req, res) => {
  try {
    const testQuery = 'Harry Potter';
    console.log(`Testing Google Books API with query: "${testQuery}"`);
    
    const books = await manualBookSearch(testQuery);
    
    res.json({
      success: true,
      message: 'Google Books API is working',
      query: testQuery,
      booksFound: books.length,
      sampleBooks: books.slice(0, 3).map(b => ({
        title: b.title,
        authors: b.authors,
        isbn: b.isbn || b.isbn13,
      })),
    });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Google Books API test failed',
    });
  }
};

// Test endpoint to verify file upload works
export const testUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
      success: true,
      message: 'File upload is working',
      file: {
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        path: req.file.path,
      },
    });
  } catch (error) {
    console.error('Upload test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
