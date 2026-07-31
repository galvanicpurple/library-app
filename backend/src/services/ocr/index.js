import { recognizeImage as tesseractRecognizeImage } from './tesseractProvider.js';
import { recognizeImage as easyocrRecognizeImage } from './easyocrProvider.js';

// Set OCR_PROVIDER=easyocr to move off Tesseract without touching any code
// outside this file: every provider must resolve to the same
// { fullText, lines: [{ text, confidence, rotation, bbox }] } shape.
const PROVIDER = process.env.OCR_PROVIDER || 'tesseract';

const providers = {
  tesseract: tesseractRecognizeImage,
  easyocr: easyocrRecognizeImage,
};

export const recognizeImage = async (imageBuffer) => {
  const recognize = providers[PROVIDER];
  if (!recognize) {
    throw new Error(`Unknown OCR_PROVIDER "${PROVIDER}". Available: ${Object.keys(providers).join(', ')}`);
  }
  return recognize(imageBuffer);
};
