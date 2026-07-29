import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';

// Whitelist covers book titles/authors: letters, numbers, and common punctuation.
const CHAR_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,&-:'";

// Book spines and covers can be photographed in any of these orientations.
const ROTATIONS = [0, 90, 270];

// Skip lines Tesseract itself isn't confident about (garbage from the wrong
// rotation, background noise, etc.) rather than feeding them to Google Books.
const MIN_LINE_CONFIDENCE = 55;

let workerPromise = null;
const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        tessedit_char_whitelist: CHAR_WHITELIST,
      });
      return worker;
    })().catch((error) => {
      // Don't cache a failed worker forever - a transient failure (e.g. a
      // cold-start hiccup downloading language data) would otherwise brick
      // every scan request until the process restarts.
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
};

// Orient by EXIF, upscale, and boost contrast for OCR. Deliberately does NOT
// apply a hard black/white threshold: Tesseract's LSTM engine reads grayscale
// well, and a fixed global threshold blows out any low/medium-contrast cover
// (e.g. gold text on a dark background) to a blank image.
const preprocessImage = async (imageBuffer, rotateDeg) => {
  const oriented = await sharp(imageBuffer).rotate().toBuffer();
  let pipeline = sharp(oriented);
  if (rotateDeg) {
    pipeline = pipeline.rotate(rotateDeg);
  }
  return pipeline
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: false })
    .greyscale()
    .normalize()
    .sharpen()
    .toBuffer();
};

const scoreResult = (data) => {
  const alnumChars = (data.text.match(/[A-Za-z0-9]/g) || []).length;
  return (data.confidence || 0) * Math.log(alnumChars + 1);
};

// Returns a provider-agnostic shape: { fullText, lines: [{ text, confidence, rotation, bbox }] }
// so downstream code (grouping, parsing, book matching) never depends on Tesseract specifics.
// A future provider (e.g. Google Cloud Vision) only needs to return this same shape.
export const recognizeImage = async (imageBuffer) => {
  const worker = await getWorker();

  const lines = [];
  let best = { text: '', score: -1 };

  for (const rotation of ROTATIONS) {
    try {
      const processed = await preprocessImage(imageBuffer, rotation);
      const { data } = await worker.recognize(processed);

      const score = scoreResult(data);
      console.log(`OCR rotation ${rotation}deg: confidence=${data.confidence?.toFixed(1)}, score=${score.toFixed(1)}`);

      if (score > best.score) {
        best = { text: data.text, score };
      }

      for (const line of data.lines || []) {
        const text = line.text.trim();
        if (text.length > 0 && line.confidence >= MIN_LINE_CONFIDENCE) {
          lines.push({
            text,
            confidence: line.confidence,
            rotation,
            bbox: line.bbox,
          });
        }
      }

    } catch (error) {
      console.error(`OCR error at rotation ${rotation}deg:`, error.message);
    }
  }

  console.log('OCR best-orientation text:', best.text);

  return {
    provider: 'tesseract',
    fullText: best.text,
    lines,
  };
};
