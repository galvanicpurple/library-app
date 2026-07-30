import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { segmentSpines } from './spineSegmentation.js';

// Orientations tried when reading a whole image (single cover or single spine).
const ROTATIONS = [0, 90, 270];

// Orientations tried per spine crop. A spine's text runs along its length, so
// once cropped it only ever needs turning a quarter turn one way or the other;
// trying 0 as well would just burn time on a guaranteed-unreadable pass.
const SPINE_ROTATIONS = [90, 270];

// Bounds worst-case scan time. Each spine costs up to two OCR passes, so a
// densely packed shelf photo would otherwise run for minutes.
const MAX_SPINES = 12;

// How many spines to try both rotations on before settling on whichever
// direction the shelf's titles actually run.
const ORIENTATION_PROBE_SPINES = 2;

// Above this many detected regions the image is unambiguously a shelf, so the
// whole-image "was this actually one cover?" fallback pass is skipped.
const MAX_REGIONS_FOR_COVER_FALLBACK = 3;

// Skip lines Tesseract itself isn't confident about (garbage from the wrong
// rotation, background noise, etc.) rather than feeding them to Google Books.
const MIN_LINE_CONFIDENCE = 55;

let workerPromise = null;
const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      // Note: tessedit_char_whitelist is intentionally NOT set here - it's a
      // documented no-op under the LSTM engine (tesseract.js's default;
      // https://github.com/tesseract-ocr/tesseract/issues/751), so setting it
      // was dead weight. Junk characters are filtered downstream instead, in
      // parseBookInfoFromText.
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
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

// Upscale and boost contrast for OCR. Deliberately does NOT apply a hard
// black/white threshold: Tesseract's LSTM engine reads greyscale well, and a
// fixed global threshold blows out any low/medium-contrast cover (e.g. gold
// text on a dark background) to a blank image.
//
// Expects an already EXIF-oriented buffer - segmentSpines normalises
// orientation once up front so it isn't redone for every crop and pass.
const preprocessImage = async (imageBuffer, rotateDeg) => {
  let pipeline = sharp(imageBuffer);
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

// One OCR attempt. `groupKey` partitions the returned lines downstream: bounding
// boxes are only comparable within a single crop at a single rotation, so each
// pass needs its own key to stop unrelated coordinate frames being clustered.
const runPass = async (worker, imageBuffer, rotateDeg, groupKey, label) => {
  const processed = await preprocessImage(imageBuffer, rotateDeg);
  const { data } = await worker.recognize(processed);

  const score = scoreResult(data);
  const wordCount = data.words?.length || 0;
  console.log(
    `OCR ${label}: confidence=${data.confidence?.toFixed(1)}, `
    + `words=${wordCount}, lines=${data.lines?.length || 0}, score=${score.toFixed(1)}`
  );
  // High confidence with zero words means Tesseract found a text-shaped region
  // but couldn't decode any characters from it - usually a photo-quality issue
  // (blur, glare, extreme angle), not a code bug. Logged explicitly so it isn't
  // mistaken for the pipeline silently failing.
  if (data.confidence > 50 && wordCount === 0) {
    console.warn(`OCR ${label}: high confidence but no words decoded - likely a blurry/low-quality region`);
  }

  const lines = (data.lines || [])
    .map((line) => ({
      text: line.text.trim(),
      confidence: line.confidence,
      rotation: groupKey,
      bbox: line.bbox,
    }))
    .filter((line) => line.text.length > 0 && line.confidence >= MIN_LINE_CONFIDENCE);

  return { text: data.text, score, lines };
};

// Returns a provider-agnostic shape: { fullText, lines: [{ text, confidence, rotation, bbox }] }
// so downstream code (grouping, parsing, book matching) never depends on Tesseract specifics.
// A future provider (e.g. Google Cloud Vision) only needs to return this same shape.
export const recognizeImage = async (imageBuffer) => {
  const worker = await getWorker();
  const { oriented, regions } = await segmentSpines(imageBuffer);

  const lines = [];
  const texts = [];

  if (regions.length >= 2) {
    // Shelf photo: read each spine on its own. Handing OCR one upright spine
    // filling the frame is the case it actually handles well, instead of a
    // whole shelf where no single title is ever large enough to resolve.
    const spines = regions.slice(0, MAX_SPINES);
    console.log(`Spine segmentation: ${regions.length} spines detected, reading ${spines.length}`);

    // Books on one shelf are almost always printed with their titles running
    // the same way, so both rotations only need trying on the first few
    // spines. Once one direction has clearly won, the rest of the shelf reuses
    // it - roughly halving the OCR passes, which matters because a dense shelf
    // otherwise risks running past the request timeout.
    const rotationScores = { 90: 0, 270: 0 };
    let lockedRotation = null;

    for (let i = 0; i < spines.length; i += 1) {
      let crop;
      try {
        crop = await sharp(oriented).extract(spines[i]).toBuffer();
      } catch (error) {
        console.error(`Failed to crop spine ${i}:`, error.message);
        continue;
      }

      const rotationsToTry = lockedRotation ? [lockedRotation] : SPINE_ROTATIONS;
      let bestForSpine = { text: '', score: -1 };

      for (const rotation of rotationsToTry) {
        try {
          const pass = await runPass(worker, crop, rotation, `spine${i}:${rotation}`, `spine ${i} @${rotation}deg`);
          lines.push(...pass.lines);
          rotationScores[rotation] += pass.score;
          if (pass.score > bestForSpine.score) bestForSpine = pass;
        } catch (error) {
          console.error(`OCR error on spine ${i} @${rotation}deg:`, error.message);
        }
      }

      if (bestForSpine.text.trim()) texts.push(bestForSpine.text.trim());

      // Only commit to one direction when the evidence is lopsided. If the
      // probe spines were unreadable the scores stay close together and both
      // rotations keep being tried, which is the safe default.
      if (!lockedRotation && i + 1 >= ORIENTATION_PROBE_SPINES) {
        const [winner, loser] = rotationScores[90] >= rotationScores[270] ? [90, 270] : [270, 90];
        if (rotationScores[winner] > 0 && rotationScores[winner] >= rotationScores[loser] * 2) {
          lockedRotation = winner;
          console.log(`Spine text direction locked to ${winner}deg for remaining spines`);
        }
      }
    }

    // Safety net for the case where segmentation misreads a single cover's
    // internal edges as spine boundaries: a cover's text is horizontal, so one
    // upright pass over the whole image recovers it.
    //
    // Only worth it for a low region count, where a mis-split cover is
    // plausible. On a genuine shelf this pass reads every spine sideways and
    // contributes nothing but mojibake, which then costs book-search quota.
    if (regions.length <= MAX_REGIONS_FOR_COVER_FALLBACK) {
      try {
        const pass = await runPass(worker, oriented, 0, 'full:0', 'full image @0deg');
        lines.push(...pass.lines);
        if (pass.text.trim()) texts.push(pass.text.trim());
      } catch (error) {
        console.error('OCR error on full-image fallback pass:', error.message);
      }
    }
  } else {
    // Single cover or single spine: no shelf structure to exploit, so try the
    // whole image in each orientation.
    let best = { text: '', score: -1 };
    for (const rotation of ROTATIONS) {
      try {
        const pass = await runPass(worker, oriented, rotation, `full:${rotation}`, `rotation ${rotation}deg`);
        lines.push(...pass.lines);
        if (pass.score > best.score) best = pass;
      } catch (error) {
        console.error(`OCR error at rotation ${rotation}deg:`, error.message);
      }
    }
    if (best.text.trim()) texts.push(best.text.trim());
  }

  const fullText = texts.join('\n');
  console.log('OCR extracted text:', fullText);

  return {
    provider: 'tesseract',
    fullText,
    lines,
  };
};
