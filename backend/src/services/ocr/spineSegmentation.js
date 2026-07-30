import sharp from 'sharp';

// Splits a bookshelf photo into individual book spines.
//
// Why this exists: OCR engines read one block of text at a time. Handed a
// whole shelf, Tesseract tries to interpret dense vertical stripes of
// differing fonts and colours as a single document page, and no individual
// spine ever fills enough of the frame to be legible. Every published
// bookshelf-recognition pipeline solves this the same way - segment the
// spines first, then recognise each one in isolation - which turns a hard
// problem into the easy one (a single upright spine) that OCR already
// handles well.
//
// The detection here is deliberately classical rather than a trained model:
// a spine boundary is a near-vertical edge running the full height of the
// shelf, which is cheap to find with a per-column edge-continuity profile
// and needs no extra runtime or model weights.

// Width the image is normalised to for analysis. Small enough that the
// per-pixel scan is fast, large enough to resolve adjacent spine edges.
const ANALYSIS_WIDTH = 900;

// Horizontal colour change for a pixel to count as a vertical edge, summed
// across R+G+B. Deliberately compares colour rather than brightness: adjacent
// spines frequently differ strongly in hue while being nearly identical in
// luminance (a dark red next to a dark slate blue is ~10 apart in greyscale
// but ~250 apart here), and greyscale discards exactly the signal that tells
// those two spines apart.
const EDGE_THRESHOLD = 60;

// Fraction of rows that must register an edge for a column to be considered a
// spine boundary. This is the key discriminator, and the margin is wide:
// measured on test shelves, true spine boundaries score ~1.0 while the
// strongest false candidates - the cap-height line of a long title, which
// runs the length of a spine and does genuinely look like an edge - top out
// around 0.36. Set between the two, nearer the noise floor so that real
// boundaries broken up by shadow or occlusion still register.
//
// Note colour difference across the boundary was measured as a discriminator
// and rejected: a false text edge scored higher (180) than a true spine
// boundary (158), because a black-on-white text line is a bigger colour jump
// than two adjacently shelved dark books.
const MIN_EDGE_CONTINUITY = 0.55;

// Near-vertical slopes (x-drift per row) tested when measuring continuity.
// Shelved books lean, and photos are rarely perfectly square-on: over an
// 800px-tall shelf a 2 degree lean drifts ~30px sideways, which a strictly
// vertical scan would smear across 30 columns and miss entirely.
const SLOPES = [-0.04, -0.02, 0, 0.02, 0.04];

// Plausible spine widths as a fraction of image width. Guards both against
// slicing one spine into strips and against calling a whole book cover a spine.
const MIN_SPINE_WIDTH_RATIO = 0.03;
const MAX_SPINE_WIDTH_RATIO = 0.5;

const DILATE_RADIUS = 2;

// Per column, the fraction of rows where the horizontal colour change is
// strong enough to look like a vertical edge - scored along several
// near-vertical slopes and keeping the best, so a leaning book still reads as
// one continuous boundary rather than a smear of weak partial ones.
const columnEdgeContinuity = (data, width, height, channels) => {
  const profile = new Float32Array(width);
  const midY = height / 2;
  const minValidRows = height * 0.8;

  for (let x = 1; x < width - 1; x += 1) {
    let best = 0;

    for (const slope of SLOPES) {
      let edgeRows = 0;
      let validRows = 0;

      for (let y = 0; y < height; y += 1) {
        const sx = Math.round(x + slope * (y - midY));
        if (sx < 1 || sx >= width - 1) continue;
        validRows += 1;

        const left = (y * width + sx - 1) * channels;
        const right = (y * width + sx + 1) * channels;
        const delta = Math.abs(data[right] - data[left])
          + Math.abs(data[right + 1] - data[left + 1])
          + Math.abs(data[right + 2] - data[left + 2]);
        if (delta >= EDGE_THRESHOLD) edgeRows += 1;
      }

      // Ignore slopes that run off the side of the image before covering
      // enough of its height to say anything meaningful.
      if (validRows >= minValidRows) {
        best = Math.max(best, edgeRows / validRows);
      }
    }

    profile[x] = best;
  }

  return profile;
};

// Widens each peak so a boundary that wobbles a pixel or two (leaning books,
// perspective, resampling) still reads as one peak. Uses a max filter rather
// than an average: averaging a one-column-wide spike across a 5-column window
// divides its height by five, pushing genuine boundaries below the detection
// threshold - which is exactly how sharp, correct edges got missed.
const dilateProfile = (profile, radius) => {
  const out = new Float32Array(profile.length);
  for (let i = 0; i < profile.length; i += 1) {
    const from = Math.max(0, i - radius);
    const to = Math.min(profile.length - 1, i + radius);
    let max = 0;
    for (let j = from; j <= to; j += 1) max = Math.max(max, profile[j]);
    out[i] = max;
  }
  return out;
};

// Local maxima above the continuity threshold, thinned so two boundaries are
// never closer together than the narrowest plausible spine. Strongest peaks
// win, so a crisp true boundary suppresses the noise around it.
//
// Detection runs on the dilated profile (tolerant of a boundary that wobbles
// a pixel or two) but each hit is then snapped to the true peak in the raw
// profile - dilation turns a peak into a flat plateau, and picking anywhere
// on that plateau would offset every crop by up to the dilation radius.
const findBoundaries = (dilated, raw, width) => {
  const minGap = Math.max(4, Math.floor(width * MIN_SPINE_WIDTH_RATIO));

  const peaks = [];
  for (let x = 1; x < width - 1; x += 1) {
    if (
      dilated[x] >= MIN_EDGE_CONTINUITY
      && dilated[x] >= dilated[x - 1]
      && dilated[x] >= dilated[x + 1]
    ) {
      peaks.push(x);
    }
  }

  peaks.sort((a, b) => dilated[b] - dilated[a]);

  const kept = [];
  for (const x of peaks) {
    if (kept.every((k) => Math.abs(k - x) >= minGap)) kept.push(x);
  }

  const snapped = kept.map((x) => {
    let bestX = x;
    for (let j = Math.max(1, x - DILATE_RADIUS); j <= Math.min(width - 2, x + DILATE_RADIUS); j += 1) {
      if (raw[j] > raw[bestX]) bestX = j;
    }
    return bestX;
  });

  return [...new Set(snapped)].sort((a, b) => a - b);
};

// Returns the EXIF-corrected image alongside the detected spine rectangles,
// so callers crop from exactly the raster the coordinates refer to.
// An empty `regions` array means "no shelf structure found" - the caller
// should fall back to reading the image as a whole.
export const segmentSpines = async (imageBuffer) => {
  const oriented = await sharp(imageBuffer).rotate().toBuffer();
  const { width: fullWidth, height: fullHeight } = await sharp(oriented).metadata();

  if (!fullWidth || !fullHeight) return { oriented, regions: [] };

  const { data, info } = await sharp(oriented)
    .resize({ width: ANALYSIS_WIDTH, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rawProfile = columnEdgeContinuity(data, info.width, info.height, info.channels);
  const dilated = dilateProfile(rawProfile, DILATE_RADIUS);

  // The image borders bound the first and last spine.
  const boundaries = [0, ...findBoundaries(dilated, rawProfile, info.width), info.width];

  const minWidth = info.width * MIN_SPINE_WIDTH_RATIO;
  const maxWidth = info.width * MAX_SPINE_WIDTH_RATIO;
  const scale = fullWidth / info.width;

  const regions = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const left = boundaries[i];
    const right = boundaries[i + 1];
    const sliceWidth = right - left;
    if (sliceWidth < minWidth || sliceWidth > maxWidth) continue;

    regions.push({
      left: Math.round(left * scale),
      top: 0,
      width: Math.min(Math.round(sliceWidth * scale), fullWidth - Math.round(left * scale)),
      height: fullHeight,
    });
  }

  // A single region is just the picture again - not a shelf. Let the caller
  // handle the whole image instead of paying for a redundant crop.
  return { oriented, regions: regions.length >= 2 ? regions : [] };
};
