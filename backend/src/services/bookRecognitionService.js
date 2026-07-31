import axios from 'axios';
import { recognizeImage } from './ocr/index.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

// Google Books API integration
export const searchGoogleBooks = async (query) => {
  try {
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    if (!apiKey) {
      console.error('GOOGLE_BOOKS_API_KEY is not set - every book search will fail with a 400/403 from Google.');
    }
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
    // Surface Google's actual error body (e.g. "API key not valid", quota
    // exceeded) instead of just the generic HTTP status - that detail is
    // what actually explains *why* every search is failing.
    const details = error.response?.data?.error?.message || error.message;
    console.error(`Google Books API error (status ${error.response?.status}):`, details);
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

// Group OCR lines into per-book candidates using bounding-box proximity.
// Lines close together (title + author stacked on one spine/cover) get merged;
// lines far apart (different spines, or the same shelf shot at different photo
// angles) stay separate. Lines from different rotation passes are never mixed
// together since their bounding boxes live in different coordinate frames.
const heightOf = (bbox) => bbox.y1 - bbox.y0;

// Distance between the nearest edges of two boxes along one axis (0 if they overlap).
const axisGap = (aMin, aMax, bMin, bMax) => {
  if (aMax < bMin) return bMin - aMax;
  if (bMax < aMin) return aMin - bMax;
  return 0;
};

// Edge-to-edge distance between two bounding boxes. Unlike center-to-center
// distance, this doesn't get inflated when one line (e.g. a large title) is
// much taller than the other (e.g. a smaller author line) sitting right below it.
const boxDistance = (a, b) => {
  const dx = axisGap(a.x0, a.x1, b.x0, b.x1);
  const dy = axisGap(a.y0, a.y1, b.y0, b.y1);
  return Math.hypot(dx, dy);
};

export const groupLinesIntoCandidates = (lines) => {
  if (lines.length === 0) return [];

  const byRotation = new Map();
  for (const line of lines) {
    if (!byRotation.has(line.rotation)) byRotation.set(line.rotation, []);
    byRotation.get(line.rotation).push(line);
  }

  const groups = [];
  for (const rotationLines of byRotation.values()) {
    const avgHeight = rotationLines.reduce((sum, l) => sum + heightOf(l.bbox), 0) / rotationLines.length;
    const threshold = avgHeight * 1.5;

    const parent = rotationLines.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    for (let i = 0; i < rotationLines.length; i++) {
      for (let j = i + 1; j < rotationLines.length; j++) {
        const dist = boxDistance(rotationLines[i].bbox, rotationLines[j].bbox);
        if (dist <= threshold) union(i, j);
      }
    }

    const clustered = new Map();
    rotationLines.forEach((line, i) => {
      const root = find(i);
      if (!clustered.has(root)) clustered.set(root, []);
      clustered.get(root).push(line);
    });

    for (const groupLines of clustered.values()) {
      groupLines.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
      groups.push({
        lines: groupLines.map(l => l.text),
        text: groupLines.map(l => l.text).join('\n'),
        confidence: groupLines.reduce((sum, l) => sum + l.confidence, 0) / groupLines.length,
      });
    }
  }

  return groups;
};

// Drop candidates that are near-duplicates of one another (the same spine can
// get picked up in more than one rotation pass) before spending Google Books
// API quota on them. Compares as a bag of words rather than a raw substring
// because line order within a candidate can vary between rotation passes
// (e.g. near-tied bounding box coordinates can sort title/author either way).
const tokenize = (text) => new Set(
  text.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter((t) => t.length > 0)
);

const isNearDuplicate = (tokensA, tokensB) => {
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  const [smaller, larger] = tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA];
  let overlap = 0;
  for (const token of smaller) if (larger.has(token)) overlap += 1;
  return overlap / smaller.size >= 0.7;
};

export const dedupeCandidates = (candidates) => {
  const kept = [];
  for (const candidate of candidates.sort((a, b) => b.confidence - a.confidence)) {
    const tokens = tokenize(candidate.text);
    if (tokens.size === 0) continue;
    const isDupe = kept.some((k) => isNearDuplicate(tokens, k.tokens));
    if (!isDupe) kept.push({ ...candidate, tokens });
  }
  return kept.map(({ tokens, ...candidate }) => candidate);
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

// Google returns *something* for nearly any query, even OCR garbage from a
// decorative border - so blindly trusting the top hit produces confident
// nonsense (e.g. a scanned Tolkien title page matching an ornithology
// journal because of a misread fragment). Require the match to actually
// share a real word with what was scanned before accepting it.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'book', 'books',
  'part', 'first', 'second', 'third', 'edition', 'york', 'foreword', 'author',
]);
const significantTokens = (text) => (
  (text.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOPWORDS.has(w))
);

// An author match counts for much more than a title match. It is the signal
// that separates a work from the books written *about* that work: scanning a
// Dune spine turns up both "Dune" by Frank Herbert and "Frank Herbert's Dune:
// A Critical Companion" by Kara Kennedy, and only the first agrees on author.
const AUTHOR_WEIGHT = 3;

// Each word in the title that the scan didn't see dilutes the match, so
// "Dune" beats "Frank Herbert's Dune: A Critical Companion" even though both
// contain the scanned words.
const EXTRA_TITLE_WORD_PENALTY = 0.3;

// One shared word is thin evidence, and on a partly-readable shelf it is
// where the confident-but-wrong answers come from: a spine that OCR'd as only
// "JONATHAN" matched "The Correspondence of Jonathan Worth", and "STARLAND"
// matched "Star Darlings: A Wisher's Guide to Starland". Neither book was on
// the shelf. A silent wrong book in the library is worse than a miss, so two
// corroborating words are required.
const MIN_MATCHED_TOKENS = 2;

// The exception: plenty of real books genuinely are one word ("Dune",
// "Emma"). A lone match still counts when it accounts for the entire title
// and the scan didn't read much else - which is a near-exact title match,
// not a passing mention of a common word inside a longer title.
const isExactShortTitleMatch = (queryTokens, titleTokens, matched) => (
  matched === 1 && titleTokens.size === 1 && queryTokens.size <= 2
);

// Subtitle text is real information but weaker evidence than the primary
// title: a scan of "PAINT BY NUMBER" that matches a book actually *titled*
// "Paint by Number" should beat one titled "Real Art!" that only mentions
// "Paint by Number" in promotional subtitle text ("The Paint by Number Book
// & Kit") - both share the same two words, but only one is the book that
// text was printed on. Full credit for a title-field hit, half credit for a
// subtitle-only one.
const SUBTITLE_WEIGHT = 0.5;

const scoreCandidate = (queryTokens, book) => {
  const titleOnlyTokens = new Set(significantTokens(book.title || ''));
  const subtitleOnlyTokens = new Set(
    significantTokens(book.subtitle || '').filter((t) => !titleOnlyTokens.has(t))
  );
  const authorTokens = new Set(significantTokens((book.authors || []).join(' ')));
  const combinedTitleTokens = new Set([...titleOnlyTokens, ...subtitleOnlyTokens]);

  let titleHits = 0;
  let subtitleHits = 0;
  let authorHits = 0;
  let matched = 0;
  for (const token of queryTokens) {
    const inTitle = titleOnlyTokens.has(token);
    const inAuthor = !inTitle && authorTokens.has(token);
    const inSubtitle = !inTitle && !inAuthor && subtitleOnlyTokens.has(token);
    // Each branch below is checked only once a stronger field hasn't already
    // claimed the token. Cheap activity/colouring books commonly have their
    // "author" field filled with a brand-name imprint that echoes the title
    // itself (e.g. "Paint Number Publishing" on a book literally titled
    // "Paint by Number") - without this exclusivity, the same words get
    // counted once at 1x (title) and again at 3x (author) for the exact
    // same evidence, which let a colouring book outscore the real,
    // correctly-authored "Paint by Number" by William L. Bird despite both
    // genuinely sharing only the title words with the scan.
    if (inTitle) {
      titleHits += 1;
    } else if (inAuthor) {
      authorHits += 1;
    } else if (inSubtitle) {
      subtitleHits += 1;
    }
    if (inTitle || inAuthor || inSubtitle) matched += 1;
  }

  // Sharing nothing at all with the scan means this is not the book, however
  // highly Google ranked it.
  if (matched === 0) return 0;

  if (matched < MIN_MATCHED_TOKENS && !isExactShortTitleMatch(queryTokens, combinedTitleTokens, matched)) {
    return 0;
  }

  const unmatchedTitleWords = Math.max(0, combinedTitleTokens.size - titleHits - subtitleHits);
  return (titleHits + subtitleHits * SUBTITLE_WEIGHT + authorHits * AUTHOR_WEIGHT)
    / (1 + unmatchedTitleWords * EXTRA_TITLE_WORD_PENALTY);
};

// Picks the result that best corresponds to what was actually scanned.
//
// Deliberately does NOT re-sort by date - sorting by "most recent" was tried
// and reverted, since it promoted unrelated-but-newer titles (a 2025
// commentary book outranking the Harry Potter novel it discusses). Ties keep
// Google's own relevance order, with a cover image as the final tiebreak.
export const pickBestMatch = (queryText, books) => {
  const queryTokens = new Set(significantTokens(queryText));

  // Nothing distinctive to verify against - typically OCR garbage such as an
  // upside-down title read off the wrong rotation. Returning a match here
  // means inventing one, which is how a scan of three novels picked up a
  // fourth, unrelated book.
  if (queryTokens.size === 0) return null;

  const scored = books
    .map((book, index) => ({ book, index, score: scoreCandidate(queryTokens, book) }))
    .filter((entry) => entry.score > 0);

  if (scored.length === 0) return null;

  scored.sort((a, b) => (
    b.score - a.score
    || (b.book.imageUrl ? 1 : 0) - (a.book.imageUrl ? 1 : 0)
    || a.index - b.index
  ));

  return scored[0].book;
};

// Search for a single candidate (one detected book) using its ISBN if present,
// otherwise its OCR'd text. Returns at most one match so a single spine
// doesn't crowd out the other books in the photo.
const searchCandidate = async (candidate) => {
  const bookInfo = parseBookInfoFromText(candidate.text);

  // ISBN matches are exact/authoritative - no relevance filtering needed.
  for (const isbn of bookInfo.potentialISBNs.slice(0, 2)) {
    try {
      const books = await searchByISBN(isbn);
      if (books.length > 0) return books[0];
    } catch (error) {
      console.error(`Failed to search ISBN ${isbn}:`, error.message);
    }
  }

  // Stylized covers commonly split a title across several lines (e.g. "THE" /
  // "FELLOWSHIP" / "OF THE RING"). Searching with all of them combined gives
  // Google's relevance ranking the full context to match against - critical,
  // because guessing "line 2 is the author" is wrong as often as it's right,
  // and can send the search off after a completely unrelated book (e.g.
  // treating "FELLOWSHIP" as an author name matches books published by an
  // organization with "Fellowship" in its name, not the Tolkien novel).
  const combinedText = candidate.lines.join(' ');
  try {
    const books = await searchGoogleBooks(combinedText);
    const match = pickBestMatch(combinedText, books);
    if (match) return match;
  } catch (error) {
    console.error(`Failed to search combined text "${combinedText}":`, error.message);
  }

  // Only fall back to a title+author split when we have an actual author
  // signal (an explicit "by ..."/"author: ..." line), not a blind guess.
  const titleGuess = candidate.lines[0];
  const authorGuess = bookInfo.potentialAuthors[0];

  if (authorGuess) {
    try {
      const books = await searchByTitleAuthor(titleGuess, authorGuess);
      const match = pickBestMatch(candidate.text, books);
      if (match) return match;
    } catch (error) {
      console.error(`Failed to search "${titleGuess}" by "${authorGuess}":`, error.message);
    }
  }

  try {
    const books = await searchByTitleAuthor(titleGuess);
    const match = pickBestMatch(candidate.text, books);
    if (match) return match;
  } catch (error) {
    console.error(`Failed to search title "${titleGuess}":`, error.message);
  }

  return null;
};

// Each candidate's Google Books lookup is an independent HTTP round-trip
// (possibly several, sequentially, inside searchCandidate itself), and this
// loop was confirmed to be the dominant cost of a full scan - ~50s of an
// ~80s total on a 15-spine real photo, more than the OCR stage. Bounded
// concurrency here cuts that wall-clock time without changing which books
// match (same candidates, same scoring, just run in parallel).
const CANDIDATE_SEARCH_CONCURRENCY = 5;

// Scan an image (single cover, single spine, or a shelf of many spines) and
// identify every book it can find. Each detected text cluster is searched
// independently so multiple books in one photo are each matched separately.
export const scanShelfImage = async (imageBuffer) => {
  try {
    const { fullText, lines } = await recognizeImage(imageBuffer);

    const rawCandidates = groupLinesIntoCandidates(lines);
    // Cap how many candidates we search per scan to bound Google Books API usage.
    const candidates = dedupeCandidates(rawCandidates).slice(0, 15);

    const foundBooks = (
      await mapWithConcurrency(candidates, CANDIDATE_SEARCH_CONCURRENCY, searchCandidate)
    ).filter(Boolean);

    // Remove duplicates based on ISBN or title
    const uniqueBooks = [];
    const seenISBNs = new Set();
    const seenTitles = new Set();

    for (const book of foundBooks) {
      if (book.isbn13 && !seenISBNs.has(book.isbn13)) {
        seenISBNs.add(book.isbn13);
        uniqueBooks.push(book);
      } else if (book.isbn && !seenISBNs.has(book.isbn)) {
        seenISBNs.add(book.isbn);
        uniqueBooks.push(book);
      } else if (!book.isbn13 && !book.isbn && !seenTitles.has(book.title)) {
        seenTitles.add(book.title);
        uniqueBooks.push(book);
      }
    }

    return {
      extractedText: fullText,
      candidatesDetected: candidates.length,
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
