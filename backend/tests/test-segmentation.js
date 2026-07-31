// Checks spine segmentation on synthetic shelves: that it finds the right
// number of spines (including when the books lean), and that it declines to
// segment images that aren't shelves at all - a single cover or a lone spine -
// so those fall back to whole-image OCR.
//
// Run with: node test-segmentation.js

import sharp from 'sharp';
import { segmentSpines } from '../src/services/ocr/spineSegmentation.js';

// One spine: a coloured vertical block with its title running bottom-to-top.
async function makeSpine({ title, author, width, height, bg, fg }) {
  const svg = `
    <svg width="${height}" height="${width}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bg}"/>
      <text x="40" y="${width * 0.45}" font-family="Georgia" font-size="${Math.round(width * 0.28)}" fill="${fg}">${title}</text>
      <text x="40" y="${width * 0.75}" font-family="Georgia" font-size="${Math.round(width * 0.2)}" fill="${fg}">${author}</text>
    </svg>
  `;
  const horizontal = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(horizontal).rotate(-90).png().toBuffer();
}

// Several spines standing side by side against a dark shelf background.
async function makeShelf(spineSpecs, height = 800) {
  const buffers = await Promise.all(
    spineSpecs.map((spec) => makeSpine({ ...spec, height }))
  );
  const metas = await Promise.all(buffers.map((b) => sharp(b).metadata()));
  const totalWidth = metas.reduce((sum, m) => sum + m.width, 0);

  let x = 0;
  const composites = buffers.map((b, i) => {
    const left = x;
    x += metas[i].width;
    return { input: b, left, top: 0 };
  });

  return sharp({
    create: { width: totalWidth, height, channels: 3, background: '#1a1a1a' },
  }).composite(composites).png().toBuffer();
}

async function makeCover() {
  const svg = `
    <svg width="600" height="900" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#123456"/>
      <text x="300" y="200" font-family="Georgia" font-size="54" fill="white" text-anchor="middle">Dune</text>
      <text x="300" y="280" font-family="Georgia" font-size="30" fill="white" text-anchor="middle">Frank Herbert</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}: got ${actual}, expected ${expected}`);
  if (ok) passed += 1; else failed += 1;
}

async function run() {
  const threeSpines = await makeShelf([
    { title: 'The Hobbit', author: 'Tolkien', width: 110, bg: '#8b0000', fg: '#f5deb3' },
    { title: 'Dune', author: 'Herbert', width: 150, bg: '#2f4f4f', fg: '#ffd700' },
    { title: 'Emma', author: 'Austen', width: 95, bg: '#4b0082', fg: '#ffffff' },
  ]);
  const three = await segmentSpines(threeSpines);
  check('3-spine shelf', three.regions.length, 3);

  const fiveSpines = await makeShelf([
    { title: 'Book One', author: 'A Author', width: 100, bg: '#8b0000', fg: '#ffffff' },
    { title: 'Book Two', author: 'B Author', width: 130, bg: '#006400', fg: '#ffffff' },
    { title: 'Book Three', author: 'C Author', width: 90, bg: '#00008b', fg: '#ffffff' },
    { title: 'Book Four', author: 'D Author', width: 120, bg: '#8b4513', fg: '#ffffff' },
    { title: 'Book Five', author: 'E Author', width: 105, bg: '#2f4f4f', fg: '#ffffff' },
  ]);
  const five = await segmentSpines(fiveSpines);
  check('5-spine shelf', five.regions.length, 5);

  // Shelved books lean and photos are rarely square-on, so boundaries in a
  // real shelf photo are near-vertical rather than exactly vertical. Shearing
  // the shelf sideways simulates that.
  // The shear leaves background wedges down each side; crop them off so the
  // test measures tolerance of slanted boundaries rather than the edges of an
  // artefact a real photo wouldn't have.
  const sheared = await sharp(threeSpines)
    .affine([[1, 0.035], [0, 1]], { background: '#1a1a1a' })
    .png()
    .toBuffer();
  const shearedMeta = await sharp(sheared).metadata();
  const wedge = Math.ceil(0.035 * shearedMeta.height) + 2;
  const leaning = await sharp(sheared)
    .extract({
      left: wedge,
      top: 0,
      width: shearedMeta.width - wedge * 2,
      height: shearedMeta.height,
    })
    .png()
    .toBuffer();
  const leaningResult = await segmentSpines(leaning);
  check('leaning (sheared) 3-spine shelf', leaningResult.regions.length, 3);

  // A single cover has no shelf structure - segmentation should decline so the
  // caller falls back to reading the whole image.
  const cover = await makeCover();
  const coverResult = await segmentSpines(cover);
  check('single cover declines segmentation', coverResult.regions.length, 0);

  // A lone spine is one book, not a shelf. The cap-height line of its title
  // runs the full length of the spine and looks a lot like a boundary, so this
  // guards the regression where a single spine got split in two.
  const singleSpine = await makeSpine({
    title: 'The Lord of the Rings', author: 'J.R.R. Tolkien',
    width: 150, height: 600, bg: '#ffffff', fg: '#000000',
  });
  const singleResult = await segmentSpines(singleSpine);
  check('single spine declines segmentation', singleResult.regions.length, 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
