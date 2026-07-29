import axios from 'axios';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

// Google Books API integration
export const searchGoogleBooks = async (query) => {
  try {
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    const url = `https://www.googleapis.com/books/v1/volumes`;
    
    const response = await axios.get(url, {
      params: {
        q: query,
        key: apiKey,
        maxResults: 10,
      },
    });

    if (!response.data.items) {
      return [];
    }

    // Transform Google Books data to our format
    const books = response.data.items.map(item => {
      const volumeInfo = item.volumeInfo;
      return {
        googleBooksId: item.id,
        isbn: volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier,
        isbn13: volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier,
        title: volumeInfo.title,
        subtitle: volumeInfo.subtitle,
        authors: volumeInfo.authors || [],
        publisher: volumeInfo.publisher,
        publishedDate: volumeInfo.publishedDate,
        description: volumeInfo.description,
        pageCount: volumeInfo.pageCount,
        categories: volumeInfo.categories || [],
        language: volumeInfo.language || 'en',
        imageUrl: volumeInfo.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
      };
    });

    return books;
  } catch (error) {
    console.error('Google Books API error:', error.message);
    throw new Error('Failed to search Google Books');
  }
};

// Search by ISBN
export const searchByISBN = async (isbn) => {
  try {
    const cleanISBN = isbn.replace(/[^0-9X]/gi, '');
    return await searchGoogleBooks(`isbn:${cleanISBN}`);
  } catch (error) {
    console.error('ISBN search error:', error);
    throw error;
  }
};

// Search by title and author
export const searchByTitleAuthor = async (title, author = '') => {
  try {
    const query = author ? `intitle:${title}+inauthor:${author}` : `intitle:${title}`;
    return await searchGoogleBooks(query);
  } catch (error) {
    console.error('Title/Author search error:', error);
    throw error;
  }
};

// Preprocess image for better OCR results
const preprocessImage = async (imageBuffer) => {
  try {
    return await sharp(imageBuffer)
      .greyscale()
      .normalize()
      .sharpen()
      .toBuffer();
  } catch (error) {
    console.error('Image preprocessing error:', error);
    return imageBuffer;
  }
};

// Extract text from image using Tesseract OCR
export const extractTextFromImage = async (imageBuffer) => {
  try {
    // Preprocess image for better OCR
    const processedImage = await preprocessImage(imageBuffer);

    // Perform OCR
    const { data: { text } } = await Tesseract.recognize(
      processedImage,
      'eng',
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      }
    );

    return text;
  } catch (error) {
    console.error('OCR error:', error);
    throw new Error('Failed to extract text from image');
  }
};

// Extract potential book titles and ISBNs from OCR text
export const parseBookInfoFromText = (text) => {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  const bookInfo = {
    potentialTitles: [],
    potentialISBNs: [],
    potentialAuthors: [],
  };

  // ISBN patterns (10 or 13 digits)
  const isbnPattern = /(?:ISBN[-\s:]?)?(\d{9}[\dX]|\d{13})/gi;
  const isbns = text.match(isbnPattern);
  if (isbns) {
    bookInfo.potentialISBNs = isbns.map(isbn => 
      isbn.replace(/[^0-9X]/gi, '')
    ).filter(isbn => isbn.length === 10 || isbn.length === 13);
  }

  // Potential titles (lines with reasonable length and capitalization)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 3 && trimmed.length < 200) {
      // Check if line starts with capital letter and has reasonable format
      if (/^[A-Z]/.test(trimmed) && !/^\d+$/.test(trimmed)) {
        bookInfo.potentialTitles.push(trimmed);
      }
    }
  }

  // Look for common author indicators
  const authorPattern = /(?:by|author[s]?:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi;
  const authors = text.match(authorPattern);
  if (authors) {
    bookInfo.potentialAuthors = authors.map(author => 
      author.replace(/(?:by|author[s]?:)\s*/gi, '').trim()
    );
  }

  return bookInfo;
};

// Scan shelf image and identify books
export const scanShelfImage = async (imageBuffer) => {
  try {
    // Extract text from image
    const extractedText = await extractTextFromImage(imageBuffer);
    
    // Parse book information
    const bookInfo = parseBookInfoFromText(extractedText);
    
    // Search for books based on extracted information
    const foundBooks = [];
    
    // First, try ISBNs (most reliable)
    for (const isbn of bookInfo.potentialISBNs.slice(0, 5)) {
      try {
        const books = await searchByISBN(isbn);
        if (books.length > 0) {
          foundBooks.push(...books);
        }
      } catch (error) {
        console.error(`Failed to search ISBN ${isbn}:`, error.message);
      }
    }

    // Then try titles (less reliable, limit to avoid API quota)
    for (const title of bookInfo.potentialTitles.slice(0, 3)) {
      try {
        const books = await searchByTitleAuthor(title);
        if (books.length > 0) {
          // Add only the first result to avoid duplicates
          foundBooks.push(books[0]);
        }
      } catch (error) {
        console.error(`Failed to search title "${title}":`, error.message);
      }
    }

    // Remove duplicates based on ISBN or title
    const uniqueBooks = [];
    const seenISBNs = new Set();
    const seenTitles = new Set();

    for (const book of foundBooks) {
      const identifier = book.isbn13 || book.isbn || book.title;
      if (book.isbn13 && !seenISBNs.has(book.isbn13)) {
        seenISBNs.add(book.isbn13);
        uniqueBooks.push(book);
      } else if (book.isbn && !seenISBNs.has(book.isbn)) {
        seenISBNs.add(book.isbn);
        uniqueBooks.push(book);
      } else if (!seenTitles.has(book.title)) {
        seenTitles.add(book.title);
        uniqueBooks.push(book);
      }
    }

    return {
      extractedText,
      bookInfo,
      books: uniqueBooks,
      booksFound: uniqueBooks.length,
    };
  } catch (error) {
    console.error('Shelf scan error:', error);
    throw new Error('Failed to scan shelf image');
  }
};

// Manual book lookup (for when user searches in store)
export const manualBookSearch = async (query) => {
  try {
    return await searchGoogleBooks(query);
  } catch (error) {
    console.error('Manual book search error:', error);
    throw error;
  }
};
