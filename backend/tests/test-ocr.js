// Self-contained OCR pipeline smoke test. Generates synthetic cover/spine/shelf
// images (no camera or real photos needed) and runs them through the exact
// same code path the app uses (src/services/ocr + bookRecognitionService),
// including live Google Books lookups.
//
// Run with: node test-ocr.js
//
// If a case fails here, the bug is in image preprocessing, Tesseract
// settings, or the line-grouping/matching logic - not your camera or photos.
// If real photos still fail after this passes, the issue is likely photo
// quality (blur, extreme angle, tiny/decorative text) rather than a code bug.

import dotenv from 'dotenv';
dotenv.config();

import sharp from 'sharp';
import { scanShelfImage } from '../src/services/bookRecognitionService.js';

async function makeCoverImage({ fontSize = 60, width = 900, height = 300, fg = 'black', bg = 'white' } = {}) {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bg}"/>
      <text x="20" y="${height / 2}" font-family="Arial" font-size="${fontSize}" fill="${fg}">The Lord of the Rings</text>
      <text x="20" y="${height / 2 + fontSize}" font-family="Arial" font-size="${Math.round(fontSize * 0.7)}" fill="${fg}">J.R.R. Tolkien</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// A single vertical spine: horizontal text physically rotated -90deg, the way
// a real book spine reads bottom-to-top.
async function makeSpineImage(title, author, fontSize = 36) {
  const width = Math.max(400, title.length * fontSize * 0.6);
  const svg = `
    <svg width="${width}" height="150" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="20" y="70" font-family="Arial" font-size="${fontSize}" fill="black">${title}</text>
      <text x="20" y="110" font-family="Arial" font-size="${Math.round(fontSize * 0.7)}" fill="black">${author}</text>
    </svg>
  `;
  const horizontal = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(horizontal).rotate(-90).png().toBuffer();
}

// Several spines standing side by side, simulating a real shelf photo.
async function makeShelfImage(spines) {
  const buffers = await Promise.all(spines.map(([t, a]) => makeSpineImage(t, a)));
  const metas = await Promise.all(buffers.map((b) => sharp(b).metadata()));
  const totalWidth = metas.reduce((sum, m) => sum + m.width, 0);
  const maxHeight = Math.max(...metas.map((m) => m.height));

  let x = 0;
  const composites = buffers.map((b, i) => {
    const left = x;
    x += metas[i].width;
    return { input: b, left, top: 0 };
  });

  return sharp({
    create: { width: totalWidth, height: maxHeight, channels: 3, background: 'white' },
  }).composite(composites).png().toBuffer();
}

let passed = 0;
let failed = 0;

// Matches on title OR author substring, since Google Books' top hit for a
// series title (e.g. "Lord of the Rings") may legitimately be a specific
// volume ("The Fellowship of the Ring") rather than an omnibus edition -
// that's correct API behavior, not a pipeline bug.
async function testCase(name, imgPromise, expectedMatches) {
  console.log(`\n=== ${name} ===`);
  const img = await imgPromise;
  const result = await scanShelfImage(img);
  console.log('Books found:', result.books.map((b) => `${b.title} (${(b.authors || []).join(', ')})`));

  const missing = expectedMatches.filter(
    (expected) => !result.books.some((b) => {
      const haystack = `${b.title} ${(b.authors || []).join(' ')}`.toLowerCase();
      return haystack.includes(expected.toLowerCase());
    })
  );

  if (missing.length === 0) {
    console.log(`PASS - found all expected: ${expectedMatches.join(', ')}`);
    passed += 1;
  } else {
    console.log(`FAIL - missing: ${missing.join(', ')}`);
    failed += 1;
  }
}

async function run() {
  await testCase(
    'Cover photo (clear, horizontal text)',
    makeCoverImage(),
    ['Tolkien']
  );

  await testCase(
    'Cover photo (low contrast - grey text on grey background)',
    makeCoverImage({ fg: '#999999', bg: '#cccccc' }),
    ['Tolkien']
  );

  await testCase(
    'Single book spine (vertical text)',
    makeSpineImage('The Lord of the Rings', 'J.R.R. Tolkien'),
    ['Tolkien']
  );

  await testCase(
    'Shelf photo with 3 different spines (multi-book detection)',
    makeShelfImage([
      ['The Hobbit', 'J.R.R. Tolkien'],
      ['Harry Potter', 'J.K. Rowling'],
      ['Dune', 'Frank Herbert'],
    ]),
    ['Hobbit', 'Harry Potter', 'Dune']
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
