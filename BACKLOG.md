# Backlog

Deferred and nice-to-have items, captured 30 July 2026. Ordered roughly by
priority within each section. Nothing here is in progress.

---

## Security / correctness

### 1. Public test endpoints are unauthenticated — DONE (30 July 2026)
`backend/src/routes/test.js` mounted two routes with no auth and no rate limit,
live on the public Railway URL:

- `POST /api/test/upload` — accepted file uploads from anyone and wrote them to
  disk. Images under 10MB only, but with no rate limit and no auth, someone
  could have filled the disk.
- `GET /api/test/google-books` — burned Google Books API quota on demand.

Both routes and their controller were deleted rather than gated: they were
debugging aids from commit `018777e`, the frontend never called them, and
their diagnostic value is now covered elsewhere (`/health` for liveness,
explicit Google Books error logging for a bad API key, and `test-image.js`
locally). Gating would have left unmaintained code on a public surface.

Recoverable from git history if ever needed.

### 2. Uploaded scan images are stored on ephemeral disk
`backend/src/middleware/upload.js` writes to `backend/uploads/`, and
`scan_sessions.image_url` records that local path. Railway's filesystem is
ephemeral, so those files vanish on every redeploy and the stored paths point
at nothing. Harmless today because nothing reads them back, but it blocks any
future "scan history with thumbnails" feature. Fix by either not persisting
the path, or moving to object storage (S3/R2/Supabase Storage).

---

## Scan accuracy

This is the main thread of work. Current measured state on a 900x600,
15-book shelf photo: **2 of 15 books correct (13% recall), 2 of 3 matches
correct (67% precision)**. Segmentation is working well; OCR is the limiter.

### 3. Re-test with a full-resolution phone photo — decides everything below
The test image was 900px wide, giving ~7-10px character heights against the
~20-30px Tesseract needs. A phone photo is 3000-4000px, which closes exactly
that gap. **Do this before any further OCR tuning** — it determines whether we
are tuning Tesseract or replacing it.

Run: `cd backend && node test-image.js <path> --save-crops`

### 4. Google Cloud Vision as the OCR provider
The fallback if a high-resolution photo still underperforms. Much stronger on
small, low-contrast and rotated scene text. The provider abstraction already
exists (`backend/src/services/ocr/`), so this is one new file plus
`OCR_PROVIDER=vision` — no changes to segmentation, grouping or matching.
Costs: needs a GCP project with billing attached; ~1,000 requests/month free,
then roughly $1.50 per 1,000.

### 5. Line-confidence threshold is discarding useful words
`MIN_LINE_CONFIDENCE = 55` in `tesseractProvider.js` threw away the word
"Wildwood" — the single most searchable word on that spine — while keeping the
generic "A Journey". The matching layer is now much better at rejecting
nonsense than when that threshold was set, so lowering it and letting the
two-word rule filter may well raise recall. Cheap to test.

### 6. Ranking picks the wrong edition when OCR is correct
OCR correctly read "PAINT BY NUMBER", but matching returned a children's
colouring book rather than William Bird's *Paint by Number*. The two-word rule
cannot help here — both words genuinely matched. Needs a better signal:
publisher, page count, or preferring titles that *start* with the scanned text.

### 7. Real-photo benchmark set
10-20 photos of actual shelves (single spines, dense shelves, covers, good and
bad lighting) with known correct answers, scored automatically. Every accuracy
change so far has been measured against one or two images, which is thin. The
harness mostly exists in `backend/test-image.js`; it needs a fixture set and
pass/fail scoring.

### 8. ISBN barcode scanning as a parallel capture mode
Not a replacement for spine scanning — a complementary path. A barcode scan is
near-100% accurate versus 13-70% for spine OCR, so for bulk-cataloguing a large
collection it is by far the most reliable route. Client-side JS libraries
(`@zxing/library`, `quagga2`) do this in-browser, so it needs no backend work.

---

## Features

### 9. Chinese language support
Tesseract accepts `'eng+chi_sim'` as a one-line change, but mixing languages
reduces accuracy on both, so a per-scan language picker is better than
always-on. The real complication: Chinese spines are often printed with
characters **stacked vertically** rather than rotated 90 degrees like Latin
text. That is a different layout problem from the one spine segmentation
solves, and needs Tesseract's separate vertical model (`chi_sim_vert`). Treat
as its own piece of work, not a flag flip.

### 10. Video game case scanning
Reuses more than expected: spine segmentation is content-agnostic (it finds
vertical boundaries and does not care what is printed on them), and game cases
are more uniform in width than books, which helps. Two pieces of work:

- A metadata provider abstraction mirroring the OCR one, so Google Books can be
  swapped for IGDB. `searchGoogleBooks` is currently hardcoded into
  `bookRecognitionService.js`.
- The schema is book-centric (`isbn`, `authors`, `page_count`) and would need
  generalising or a parallel table.

### 11. Shelf organisation features
Shelves exist and can be created and assigned, but the original goal — suggest
an optimal ordering, then tell you which shelf a book is on when you search —
is only partly built (`backend/src/services/organizationService.js`). Worth a
review of what actually works end to end before extending.

### 12. Rename the app
"LibraryApp" is a placeholder. Flagged as low priority from the start.

### 13. Manual book entry — DONE (30 July 2026)
Added a modal form on the Library page (title required, everything else
optional) using the existing `POST /api/books`. Also fixed the dedupe bug
this surfaced: `addBook` matched catalogue rows with `WHERE isbn = $1 OR
title = $2`, and since `NULL = NULL` is never true in SQL, an ISBN-less
manual entry fell through to matching on title alone — silently merging any
two different books sharing a title. Verified: the same title+author
submitted twice now correctly reuses the catalogue entry and flags
`is_duplicate`; the same title with a different author gets its own entry.

### 14. Reading status + star rating — DONE (30 July 2026)
Turned out to be a prerequisite for favourites, not an optional nice-to-have:
the recommendation engine has always required `readings.status = 'completed'
AND rating >= 4`, but no UI anywhere could write a `readings` row — the
frontend only ever called `readingsAPI.getStats()`. Recommendations, the
Dashboard's reading counters, and any future favourites feature were all
silently dead regardless of how much a user scanned in.

Added a status dropdown (want to read / reading / completed / abandoned) and
a 1-5 star rating to each Library card. This surfaced a real pre-existing
backend bug: `updateReading` could never have succeeded, on either this
session's code or before it. Postgres unifies a parameter's type across every
occurrence in one statement, and the status parameter was used both
positionally into a `varchar` column and inside text comparisons in the same
query — rejected with `42P08 inconsistent types deduced for parameter`.
Fixed by casting consistently everywhere, not just in the comparisons (the
first attempted fix was still wrong for exactly that reason — worth knowing
if this class of error resurfaces elsewhere).

Verified via the actual browser UI end-to-end, not just curl: set a status,
rate a book, un-rate it (confirmed the clear persists in the database, not
just the display — `rating: 0` from clicking a filled star was silently
being dropped from the request rather than sent as an explicit clear, a bug
in the new frontend code caught by the same test), untrack a book, and
confirmed the exact favourite-author query the recommendation engine
depends on now returns real data after rating a book.

### 15. Favourite / star flag, distinct from a 1-5 rating
What #14 deliberately did *not* build: a boolean "favourite" independent of
the star rating. The recommendation engine and UI now use a 1-5 rating
(`status = 'completed' AND rating >= 4` counts as "favourite" for picking
recommended authors/genres), which is what was actually requested and is
simpler than adding a parallel flag. Revisit only if a rating turns out to
not be expressive enough — e.g. wanting to flag a book as a favourite before
finishing it, which the current design cannot do since rating requires a
status.

---

## Infrastructure

### 16. Make scanning asynchronous
Scanning currently blocks an HTTP request for 6-40 seconds. That is fragile on
any host and gets worse as shelves get denser — `MAX_SPINES` is capped at 24
purely to bound request time, which means a very dense shelf still silently
drops books. Submitting a job and polling for the result removes the entire
timeout failure class and makes the spine cap unnecessary.

**This is the right fix for scan timeouts — not a faster host.**

### 17. Hosting review (only if genuinely CPU-bound)
Railway is fine for now; the deploy stall seen on 29 July was an upstream
GitHub issue, not Railway being slow. If OCR CPU becomes the real limit, the
honest ranking is:

- **Hetzner / DigitalOcean VPS** (~EUR 4-5/month) — roughly 10x the CPU of a
  free tier, at the cost of managing it yourself.
- **Fly.io** — middle ground, runs Docker, decent free allowance.
- **Render** — a lateral move; its free tier cold-starts ~50s, which is worse.

Migration is easy either way: standard Node + Postgres using `DATABASE_URL`,
with no Railway-specific APIs. No lock-in.

---

## Housekeeping

### 18. Debug scripts in `backend/`
`test-google-api.js`, `test-ocr.js`, `test-segmentation.js` and
`test-image.js` are all useful diagnostics but sit loose in the backend root
and are not wired into `npm test`. Worth moving under `backend/tests/` and
adding an `npm run test:ocr` script.
