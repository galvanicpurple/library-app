import { recognizeImage as tesseractRecognizeImage } from './tesseractProvider.js';

// Swap OCR_PROVIDER=vision (once a visionProvider.js exists) to move off Tesseract
// without touching any code outside this file: every provider must resolve to the
// same { fullText, lines: [{ text, confidence, rotation, bbox }] } shape.
const PROVIDER = process.env.OCR_PROVIDER || 'tesseract';

const providers = {
  tesseract: tesseractRecognizeImage,
  // vision: googleVisionRecognizeImage,
};

export const recognizeImage = async (imageBuffer) => {
  const recognize = providers[PROVIDER];
  if (!recognize) {
    throw new Error(`Unknown OCR_PROVIDER "${PROVIDER}". Available: ${Object.keys(providers).join(', ')}`);
  }
  return recognize(imageBuffer);
};
