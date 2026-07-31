import sharp from 'sharp';
import axios from 'axios';
import { segmentSpines } from './spineSegmentation.js';
import { mapWithConcurrency } from '../../utils/concurrency.js';

// Read lazily (at call time), not at module load: callers like
// tests/test-ocr.js run `dotenv.config()` before importing this module, but
// ESM hoists all `import` statements above other top-level code, so a
// module-level `const` here would capture `process.env` before dotenv had
// populated it and silently see undefined.
const getServiceConfig = () => ({
  url: process.env.OCR_SERVICE_URL,
  token: process.env.OCR_SERVICE_TOKEN,
});

// Same cap as tesseractProvider.js - bounds worst-case scan time.
const MAX_SPINES = 24;

// Above this many detected regions the image is unambiguously a shelf, so the
// whole-image "was this actually one cover?" fallback pass is skipped.
const MAX_REGIONS_FOR_COVER_FALLBACK = 3;

// Same 0-100 scale as tesseractProvider.js's MIN_LINE_CONFIDENCE - the Modal
// endpoint rescales EasyOCR's native 0-1 confidence to match, so this
// threshold (and the rest of the matching pipeline) doesn't need to know
// which OCR engine produced a line.
const MIN_LINE_CONFIDENCE = 55;

// Crops from segmentSpines are extracted at full photo resolution - a single
// spine crop from an 8000px-wide source photo can be tens of MB. EasyOCR
// doesn't need that much detail (~20-30px character height is already
// plenty - see CLAUDE.md), so downsizing before the network hop cuts both
// transfer and OCR compute time. Verified against a real crop during this
// migration (the merged Sherlock Holmes/Austen/Bronte spine from item 14's
// testing): downsizing to 1500px on the long edge didn't just preserve
// accuracy, it raised confidence and fixed one previously-garbled word
// ("SHERLOck" -> "SHERLOCK") - less noise for the model to resolve.
const MAX_UPLOAD_DIMENSION = 1500;
const UPLOAD_JPEG_QUALITY = 85;

// Each Modal call is an independent, stateless HTTP request (unlike
// tesseractProvider's single in-process worker), so spines can be OCR'd in
// parallel instead of one at a time. Bounded rather than unlimited so a
// dense shelf doesn't fire 24 requests at once against a service that may
// still be cold-starting extra containers.
const REQUEST_CONCURRENCY = 6;

const prepareForUpload = (imageBuffer) => (
  sharp(imageBuffer)
    .resize(MAX_UPLOAD_DIMENSION, MAX_UPLOAD_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: UPLOAD_JPEG_QUALITY })
    .toBuffer()
);

// One call to the Modal endpoint. EasyOCR's rotation_info tries every
// orientation internally and maps rotated-pass bounding boxes back onto the
// original crop before returning them, so unlike tesseractProvider this
// never needs a separate pass per rotation - one HTTP call per crop returns
// every line EasyOCR found, already in that crop's own coordinate frame.
// `groupKey` is that frame's identifier for groupLinesIntoCandidates
// downstream - it only needs to be unique per crop, not meaningful as an
// actual rotation angle.
const recognizeCrop = async (imageBuffer, groupKey, label) => {
  const { url, token } = getServiceConfig();
  const uploadBuffer = await prepareForUpload(imageBuffer);

  let data;
  try {
    const response = await axios.post(url, uploadBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: `Bearer ${token}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 60000,
    });
    data = response.data;
  } catch (error) {
    console.error(`EasyOCR request failed for ${label}:`, error.response?.data || error.message);
    return [];
  }

  const lines = (data.lines || [])
    .map((line) => ({
      text: line.text.trim(),
      confidence: line.confidence,
      rotation: groupKey,
      bbox: line.bbox,
    }))
    .filter((line) => line.text.length > 0 && line.confidence >= MIN_LINE_CONFIDENCE);

  console.log(
    `EasyOCR ${label}: ${lines.length} lines above confidence threshold `
    + `(${data.lines?.length || 0} detected)`
  );
  return lines;
};

// Returns the same provider-agnostic shape as tesseractProvider.js:
// { fullText, lines: [{ text, confidence, rotation, bbox }] }.
export const recognizeImage = async (imageBuffer) => {
  const { url, token } = getServiceConfig();
  if (!url || !token) {
    throw new Error('OCR_SERVICE_URL and OCR_SERVICE_TOKEN must be set to use OCR_PROVIDER=easyocr');
  }

  const { oriented, regions } = await segmentSpines(imageBuffer);

  const lines = [];
  const texts = [];

  if (regions.length >= 2) {
    const spineRegions = regions.slice(0, MAX_SPINES);
    console.log(`Spine segmentation: ${regions.length} spines detected, reading ${spineRegions.length}`);

    const crops = [];
    for (let i = 0; i < spineRegions.length; i += 1) {
      try {
        crops.push(await sharp(oriented).extract(spineRegions[i]).toBuffer());
      } catch (error) {
        console.error(`Failed to crop spine ${i}:`, error.message);
        crops.push(null);
      }
    }

    const perSpineLines = await mapWithConcurrency(crops, REQUEST_CONCURRENCY, (crop, i) => (
      crop ? recognizeCrop(crop, `spine${i}`, `spine ${i}`) : []
    ));

    for (const spineLines of perSpineLines) {
      lines.push(...spineLines);
      const text = spineLines.map((l) => l.text).join('\n');
      if (text.trim()) texts.push(text.trim());
    }

    // Safety net for the case where segmentation misreads a single cover's
    // internal edges as spine boundaries - same rationale as
    // tesseractProvider.js's fallback pass.
    if (regions.length <= MAX_REGIONS_FOR_COVER_FALLBACK) {
      const fallbackLines = await recognizeCrop(oriented, 'full', 'full image fallback');
      lines.push(...fallbackLines);
      const text = fallbackLines.map((l) => l.text).join('\n');
      if (text.trim()) texts.push(text.trim());
    }
  } else {
    // Single cover or single spine: no shelf structure to exploit, read the
    // whole image in one call.
    const wholeLines = await recognizeCrop(oriented, 'full', 'whole image');
    lines.push(...wholeLines);
    const text = wholeLines.map((l) => l.text).join('\n');
    if (text.trim()) texts.push(text.trim());
  }

  const fullText = texts.join('\n');
  console.log('EasyOCR extracted text:', fullText);

  return {
    provider: 'easyocr',
    fullText,
    lines,
  };
};
