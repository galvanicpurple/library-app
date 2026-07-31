import { recognizeImage as tesseractRecognizeImage } from './tesseractProvider.js';
import { recognizeImage as easyocrRecognizeImage } from './easyocrProvider.js';

// Set OCR_PROVIDER=easyocr to move off Tesseract without touching any code
// outside this file: every provider must resolve to the same
// { fullText, lines: [{ text, confidence, rotation, bbox }] } shape.
const providers = {
  tesseract: tesseractRecognizeImage,
  easyocr: easyocrRecognizeImage,
};

export const recognizeImage = async (imageBuffer) => {
  // Read lazily (at call time), not at module load: server.js calls
  // dotenv.config() after its own import statements, but ESM hoists all
  // `import`s (including this file, transitively) above other top-level
  // code - a module-level `const` here would run before dotenv.config() and
  // always see `undefined`, silently falling back to 'tesseract' regardless
  // of what OCR_PROVIDER is actually set to. Confirmed this was happening in
  // both the real server and test scripts before this fix.
  const provider = process.env.OCR_PROVIDER || 'tesseract';
  const recognize = providers[provider];
  if (!recognize) {
    throw new Error(`Unknown OCR_PROVIDER "${provider}". Available: ${Object.keys(providers).join(', ')}`);
  }
  return recognize(imageBuffer);
};
