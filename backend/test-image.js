// Runs a real photo through the full scan pipeline (segmentation -> OCR ->
// Google Books matching) and prints what each stage produced. This is the
// fastest way to diagnose a photo that didn't scan properly, since it shows
// where the chain broke rather than just the final result.
//
// Usage: node test-image.js <path-to-image> [--save-crops]
//
//   --save-crops  writes each detected spine crop to crops/spine-N.png so you
//                 can see whether segmentation cut the shelf in the right places

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { segmentSpines } from './src/services/ocr/spineSegmentation.js';
import { recognizeImage } from './src/services/ocr/index.js';
import { scanShelfImage } from './src/services/bookRecognitionService.js';

const imagePath = process.argv[2];
const saveCrops = process.argv.includes('--save-crops');

if (!imagePath) {
  console.error('Usage: node test-image.js <path-to-image> [--save-crops]');
  process.exit(1);
}

if (!fs.existsSync(imagePath)) {
  console.error(`No such file: ${imagePath}`);
  process.exit(1);
}

const heading = (text) => console.log(`\n${'='.repeat(60)}\n${text}\n${'='.repeat(60)}`);

async function run() {
  const imageBuffer = fs.readFileSync(imagePath);
  const meta = await sharp(imageBuffer).metadata();

  heading('IMAGE');
  console.log(`File:        ${path.resolve(imagePath)}`);
  console.log(`Dimensions:  ${meta.width} x ${meta.height}`);
  console.log(`Format:      ${meta.format}`);
  console.log(`Size:        ${(imageBuffer.length / 1024).toFixed(0)} KB`);
  // Small images are the most common cause of unreadable spine text.
  if (meta.width < 1000) {
    console.log('NOTE: under 1000px wide - spine text may be too small to resolve.');
  }

  heading('STAGE 1: SPINE SEGMENTATION');
  const t0 = Date.now();
  const { oriented, regions } = await segmentSpines(imageBuffer);
  console.log(`Took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (regions.length === 0) {
    console.log('No shelf structure found - will read the whole image instead.');
    console.log('(Expected for a single cover or a lone spine.)');
  } else {
    console.log(`${regions.length} spine regions detected:`);
    regions.forEach((r, i) => {
      console.log(`  spine ${i}: x=${r.left}..${r.left + r.width} (width ${r.width}px)`);
    });
  }

  if (saveCrops && regions.length > 0) {
    fs.mkdirSync('crops', { recursive: true });
    for (let i = 0; i < regions.length; i += 1) {
      await sharp(oriented).extract(regions[i]).toFile(`crops/spine-${i}.png`);
    }
    console.log(`\nWrote ${regions.length} crops to crops/ - open these to check the cut positions.`);
  }

  heading('STAGE 2: OCR');
  const t1 = Date.now();
  const ocr = await recognizeImage(imageBuffer);
  console.log(`\nTook ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`\n${ocr.lines.length} text lines passed the confidence filter:`);
  for (const line of ocr.lines) {
    console.log(`  [${line.rotation} conf=${line.confidence.toFixed(0)}] "${line.text}"`);
  }
  if (ocr.lines.length === 0) {
    console.log('  (none - OCR could not read any text confidently)');
  }

  heading('STAGE 3: BOOK MATCHING');
  const t2 = Date.now();
  const result = await scanShelfImage(imageBuffer);
  console.log(`Took ${((Date.now() - t2) / 1000).toFixed(1)}s`);
  console.log(`\nText clusters searched: ${result.candidatesDetected}`);
  console.log(`Books matched: ${result.booksFound}`);
  for (const book of result.books) {
    console.log(`  - ${book.title}${book.subtitle ? `: ${book.subtitle}` : ''}`);
    console.log(`      by ${(book.authors || []).join(', ') || 'unknown'}`);
  }

  heading('SUMMARY');
  console.log(`Spines detected: ${regions.length || 'n/a (whole-image mode)'}`);
  console.log(`Lines read:      ${ocr.lines.length}`);
  console.log(`Books matched:   ${result.booksFound}`);
  console.log(`Total time:      ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  process.exit(0);
}

run().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
