# Backlog

The live, ordered work plan for this project. Started 30 July 2026, last
updated 31 July 2026. Active work is grouped by theme below and ordered
roughly by priority within each section. Once an item is fully done,
decided-and-closed, or deliberately deprioritized, it moves to the
"Completed / Resolved" section at the end - kept there for context, not
deleted, so later sessions can see *why* a decision was made, not just that
it was.

**New to this file?** Start with CLAUDE.md instead - it explains the app
itself and points back here for what to work on next. This file assumes
you've already read that.

---

## Security / correctness

### 1. Uploaded scan images are stored on ephemeral disk — PARTIALLY DONE (30 July 2026)
`backend/src/middleware/upload.js` writes to `backend/uploads/`, and
`scan_sessions.image_url` used to record that local path. Railway's
filesystem is ephemeral, so those files vanish on every redeploy and the
stored paths pointed at nothing. Nothing read the column back, so
`scanController.js` now writes `null` instead of `req.file.path` — stopped
persisting a path that was already known to go stale, rather than recording
misleading data.

Not fully closed: the underlying limitation (no durable storage for scan
photos) is unchanged, and still blocks any future "scan history with
thumbnails" feature. That still needs object storage (S3/R2/Supabase
Storage) if it's ever wanted - deliberately out of scope here since nothing
currently needs it (YAGNI). Stays in Active, not Completed, until that
remaining piece is either built or explicitly dropped.

---

## Scan accuracy

This is the main thread of work. The original baseline (2 of 15 books
correct on a 900x600 photo) is out of date — item 14's full-resolution
re-test (see Completed / Resolved below) settled the open question:
segmentation turned out not to be uniformly "working well" (it fails on
adjacent low-contrast spines), and OCR/Tesseract itself, not resolution, is
the confirmed dominant failure. Item 2, in Completed / Resolved below (the
OCR engine was fully migrated and is now live in production), is what that
determined.

### 3. Real-photo benchmark set
10-20 photos of actual shelves (single spines, dense shelves, covers, good and
bad lighting) with known correct answers, scored automatically. Every accuracy
change so far has been measured against one or two images, which is thin. The
harness mostly exists in `backend/tests/test-image.js`; it needs a fixture
set and pass/fail scoring.

Small start made incidentally during item 14's testing: two real photos live
in `backend/test-images/` (gitignored — stock photos, not ours to
redistribute). Still just 2 of the wanted 10-20, and there's no known-correct-
answers file or automated scoring yet — this item is not done, just seeded.

**This is currently the highest-leverage next step** if picking up this
project with no other assignment - see CLAUDE.md's "Current state" section.

---

## Features

### 5. Chinese language support
Tesseract accepts `'eng+chi_sim'` as a one-line change, but mixing languages
reduces accuracy on both, so a per-scan language picker is better than
always-on. The real complication: Chinese spines are often printed with
characters **stacked vertically** rather than rotated 90 degrees like Latin
text. That is a different layout problem from the one spine segmentation
solves, and needs Tesseract's separate vertical model (`chi_sim_vert`). Treat
as its own piece of work, not a flag flip.

### 6. Shelf organisation features
Shelves exist and can be created and assigned, but the original goal — suggest
an optimal ordering, then tell you which shelf a book is on when you search —
is only partly built (`backend/src/services/organizationService.js`). Worth a
review of what actually works end to end before extending.

### 20. No self-service "delete my account" option
Found in passing (31 July 2026) while cleaning up a throwaway test account
created to verify a production deploy: there's no API route or UI button
for a user to delete their own account, only manual `DELETE FROM users`
via direct database access. Low priority for the real user (nobody's asking
for it), but a genuine gap, and it made routine test-account cleanup this
session slower than it should be (had to go through Railway's dashboard
data tab rather than a script or app feature). Worth adding if verification
against production becomes a regular habit, or if account deletion is ever
requested for real.

### 7. Rename the app
"LibraryApp" is a placeholder. Flagged as low priority from the start.

### 8. Favourite / star flag, distinct from a 1-5 rating
What #18 deliberately did *not* build: a boolean "favourite" independent of
the star rating. The recommendation engine and UI now use a 1-5 rating
(`status = 'completed' AND rating >= 4` counts as "favourite" for picking
recommended authors/genres), which is what was actually requested and is
simpler than adding a parallel flag. Revisit only if a rating turns out to
not be expressive enough — e.g. wanting to flag a book as a favourite before
finishing it, which the current design cannot do since rating requires a
status.

### 9. Multi-media-type support (books / games / manga)
Later-release, not current work. Investigated 30 July 2026: today there is
exactly one media type baked into every layer of the app, not a partial
abstraction waiting to be extended. The two subpoints below (games, manga)
both depend on the same shared scaffolding rather than being independent -
building it once and sharing it avoids two one-off migrations.

**Current state:**
- Database: one `books` table with book-only columns (`isbn`, `page_count`,
  `authors[]`), no `type`/`media_type` discriminator anywhere. `user_books`,
  `readings`, and `scan_sessions` all FK directly to `book_id`.
- Backend: `booksController.js`, `bookRecognitionService.js`, and every route
  (`/api/books`, `/api/scan`, `/api/readings`) assume books.
  `searchGoogleBooks` is hardcoded, not pluggable.
- Frontend: one flat 5-item Navbar (Dashboard/Library/Shelves/Scan/
  Recommendations), one `/library` route, one `Library.jsx` page whose
  add-item form is hardcoded to book fields.

**Effort estimate for the shared scaffolding, by layer:**

| Layer | Work | Est. | Risk |
|---|---|---|---|
| DB schema | `books` → polymorphic `items` (type + shared fields) or parallel tables; migrate `user_books`/`readings`/`scan_sessions` to reference it; migrate existing data | 1-2 days | Higher — touches the real user's live data, needs a tested migration |
| Backend routes/services | Generalize CRUD controllers per type; metadata-provider abstraction (Google Books/IGDB/AniList) | 2-3 days | Low-moderate |
| Frontend | New nav sections, type-aware or type-specific Library pages, per-type add-item forms, scan "what am I scanning" mode | 3-5 days | Moderate — no reusable "generic catalog view" exists yet |

**Total for the shared scaffolding alone: roughly 6-10 days**, before either
subpoint below is actually functional on top of it.

**What reuses without rework:** `CameraScanner.jsx` (capture is already
media-agnostic), `spineSegmentation.js` (already content-agnostic by design -
finds boundaries, doesn't care what's printed on them), the OCR pipeline
(`ocr/index.js`, `tesseractProvider.js` - reads text regardless of subject),
the matching *algorithm* shape in `bookRecognitionService.js`
(`groupLinesIntoCandidates`, `dedupeCandidates`, `scoreCandidate`/
`pickBestMatch` - item 16's title/subtitle/author weighting fixes transfer
directly, just pointed at a different API response shape), auth,
shelves-as-a-container, `StarRating`, and the reading-status pattern
(want/reading/completed generalizes to e.g. "want to play/playing/beaten").

**What's genuinely new, not reuse:** the DB polymorphism, the nav/section
UI, and each subpoint's own metadata integration below.

#### Video game case scanning
Reuses more than expected on top of the shared scaffolding: spine
segmentation is content-agnostic, and game cases are more uniform in width
than books, which helps. Needs its own metadata provider - Google Books
swapped for IGDB - and game-specific fields (platform, genre) the
polymorphic schema above should account for. Estimated at 1-2 days once the
shared scaffolding exists.

#### Manga / graphic novel support
Manga collectors typically own many volumes of the same series, which is a
different shape of value than single-book cataloguing: a "series completion"
view (which volumes of a series are owned vs missing) would be genuinely
useful and isn't something the current book-by-book model provides.

Needs its own metadata provider, not Google Books: its manga coverage is
thin and volume-specific data (exact volume number, English vs original
Japanese edition) is unreliable there. A manga-specific source - AniList's
API or MangaUpdates - fits better, with real per-volume data.

OCR: English-localized manga spines are just Latin text, no special handling
needed. Original-language (Japanese) tankobon would hit the same CJK
stacked-vertical-text problem noted for Chinese support (item 5), and would
need the same dedicated treatment if ever supported - not required for an
English-collection-only first version.

Schema: needs a `series` + `volume_number` shape that `authors`/`isbn`/
`page_count` doesn't fit well - covered by the polymorphic schema above.

Estimated at 1-2 days once the shared scaffolding exists.

---

## Completed / Resolved

Historical record of fully finished, decided-and-closed, or deliberately
deprioritized work — nothing further planned. Kept for context and
cross-references from active items above, not because there's further
action here. Ordered by item number, not by date.

### 2. OCR provider decision: self-hosted open-source, not Cloud Vision — DONE, LIVE IN PRODUCTION (31 July 2026)
Cloud Vision was the original fallback plan (see git history for the old
text of this item) but is ruled out: it requires sending personal photos to
Google, which is a hard no on privacy grounds, separate from and in addition
to the cost question.

Decided instead: replace Tesseract with a self-hosted open-source OCR engine
trained on **scene text** (text photographed on real-world objects) rather
than scanned documents — **EasyOCR** or **PaddleOCR**. This lines up directly
with item 14's findings: decorative backgrounds and stylized display fonts are
normal scene-text territory, not document territory, which is exactly what
broke Tesseract. Leaning EasyOCR first: pure PyTorch, straightforward
install, better-supported on Windows than PaddleOCR's PaddlePaddle framework
(relevant since local dev is Windows). The provider abstraction in
`backend/src/services/ocr/` still applies — same `{ fullText, lines }` shape.

Phased plan, all done:
1. **Validate** EasyOCR as a standalone script against real spine crops -
   confirm it actually reads real spines before investing further. **DONE**,
   see "Step 1 findings" below.
2. **Minimal Python HTTP service** wrapping EasyOCR. Superseded by the
   hosting decision below (Modal): Modal's own deployment model (a decorated
   Python function + `modal deploy`) replaced "write a FastAPI/Flask
   service, then separately deploy it somewhere." **DONE** - see
   `ocr-service/app.py` and `ocr-service/README.md`.
3. **New Node provider**, `backend/src/services/ocr/easyocrProvider.js`,
   calling that service and matching the existing shape;
   `OCR_PROVIDER=easyocr`. **DONE** - see "Steps 2-5 findings" below.
4. **Deployment** on Modal (a serverless Python host - see the hosting
   comparison further down this entry for why Modal over other options).
   **DONE** - deployed at
   `https://galvanicpurple--libraryapp-ocr-ocrservice-recognize.modal.run`,
   auth via a shared-secret `Authorization: Bearer` header checked against
   the `ocr-service-token` Modal secret (matching value in `backend/.env` as
   `OCR_SERVICE_TOKEN`).
5. **Re-verify** with `npm run test:ocr`, `npm run test:segmentation`, and
   real photos against the new provider; confirm the matching logic still
   behaves correctly against the new output shape. **DONE** - see "Steps 2-5
   findings" below.

**Step 1 findings:** Tested EasyOCR locally (Python 3.12 + `pip install
easyocr`, CPU-only, no deployment needed for this step) against four spine
crops already saved from two real test photos -
`rotation_info=[90, 180, 270]` handles the vertical-text detection in one
call, unlike Tesseract's separate per-rotation passes:

- A known-easy case ("Golf Is Where You Find It") read correctly, as
  expected - sanity check passed.
- "The 500" (bold stylized font, Tesseract: nothing) - partial improvement:
  garbled title, but picked up fragments of the publisher imprint
  ("REAG4N" ≈ Reagan Arthur). Not clean, but strictly better than nothing.
- "Uncommon Service" (bold stylized font, Tesseract: nothing) - **real win**:
  both author surnames read correctly and with high confidence - "FREI"
  (0.92), "MORRISS" (0.99) - even though the title itself still garbled.
  Likely enough for a correct match on its own, since two corroborating
  author tokens at AUTHOR_WEIGHT's 3x weighting is exactly the matching
  layer's strongest signal.
- The Vanity Fair spine (decorative diamond-pattern background, Tesseract:
  nothing) - **no improvement**: a few stray digits, no real text recovered.
  Confirms the busy-decorative-background problem isn't Tesseract-specific -
  it's a genuinely hard case for scene-text OCR generally, not just a
  Tesseract limitation. EasyOCR is being carried forward anyway since it's
  never worse than Tesseract and meaningfully better on the stylized-font
  half of the failure set - the decorative-background half remains a known,
  accepted limitation rather than something either engine tested so far solves.

**Steps 2-5 findings:**

Built `ocr-service/app.py`: a Modal `@app.cls` with `@modal.enter()` loading
`easyocr.Reader(['en'], gpu=False)` once per container (not per request),
and one `@modal.fastapi_endpoint(method="POST")` accepting raw image bytes
and returning `{ lines: [{ text, confidence (0-100), bbox }] }`. Two real
deploy-time bugs worth knowing if this file is ever touched again (both
detailed with fixes in `ocr-service/README.md`): the endpoint's `request`
parameter needs an explicit `request: Request` type annotation or Modal/
FastAPI silently treats it as a required query parameter (every call 422s);
and EasyOCR's bbox/confidence values are numpy scalar types, which
`JSONResponse`'s stdlib `json.dumps` rejects outright unless cast to native
`int`/`float` first.

Built `backend/src/services/ocr/easyocrProvider.js`, mirroring
tesseractProvider.js's shape but simpler in one real way: EasyOCR's
`rotation_info=[90, 180, 270]` tries every orientation in a single call and
maps rotated detections back onto the original crop's coordinate frame
before returning them, so - unlike Tesseract - there's no need for a
separate pass per rotation, and no "which rotation is winning" locking logic
to carry over. Two design decisions made while building it, not pre-planned:

- **Crops are downsized before upload** (1500px on the long edge, JPEG
  quality 85). Full-resolution spine crops from a real 8000px+ shelf photo
  can be 20-40MB each, which made a single request take 15-100+ seconds
  (transfer + EasyOCR's own compute time on a huge image). Downsizing
  measurably *improved* accuracy on a real test crop (the merged Sherlock
  Holmes/Austen/Bronte region from item 14) rather than just speeding things
  up, so this wasn't a quality/speed tradeoff.
- **Spines are OCR'd with bounded concurrency (6 at a time)**, not
  sequentially. Each Modal call is an independent stateless HTTP request,
  unlike Tesseract's single in-process worker that genuinely could only do
  one recognition at a time - so there's no reason to serialize these.

One real bug caught during verification, not present in tesseractProvider.js
because it has no env-dependent config: reading `process.env.OCR_SERVICE_URL`
at module load time raced against `dotenv.config()` in the test scripts.
ESM hoists all `import` statements above other top-level code, so
`test-ocr.js`'s `import { scanShelfImage } ...` (which transitively imports
easyocrProvider.js) actually ran before its own `dotenv.config()` call,
leaving a module-level `const` pointed at `undefined`. Fixed by reading the
config lazily, inside the functions that use it, instead of at module scope.
(This same class of bug recurred later and more seriously - see below.)

**Verification results:**

- `npm run test:segmentation` - unaffected, 5/5 pass (segmentation has no
  OCR-provider dependency).
- `npm run test:ocr` (synthetic images) - 2/4 pass with `OCR_PROVIDER=easyocr`.
  Both cover-photo cases pass; both spine-image cases (which render as small,
  ultra-clean vertical vector text via SVG) fail, reading garbage
  (`"Rings"`, `"the"`, `"JO"`, `"Coxen"` instead of "The Lord of the Rings" /
  "J.R.R. Tolkien"). Confirmed this is not an adapter bug: the same garbage
  comes back calling EasyOCR directly on the raw, uncompressed PNG (no
  resize/JPEG step involved), and upscaling the image 3x doesn't help either.
  This is a genuine, expected difference between the two engines rather than
  a regression - EasyOCR is a scene-text model tuned for real photographed
  text, and these synthetic cases are exactly the opposite of that (crisp,
  noise-free, machine-rendered), while Tesseract (document-OCR-oriented)
  handles them natively. The synthetic suite was written against Tesseract's
  strengths; it isn't a representative benchmark for a scene-text engine and
  isn't being chased for parity here - the real target is real photos (see
  below), which is what this whole migration was for.
- `npm run test:image` against both real photos from item 14 -
  **substantial, real improvement**, matching what Step 1 predicted:
  - The Penguin Clothbound Classics photo's merged decorative gold-foil
    region (Sherlock Holmes/Jane Austen/Jane Eyre, the case Tesseract read
    *nothing* off in item 14) now reads "COMPLETE SHERLOCK", "JANE",
    "CHARLOTTE BRONTE", "AUSTEN", "BRONTE", "SEVEN NOVELS", "WUTHERING" -
    real, legible fragments. End-to-end book matching found 3 books
    (Charlotte Brontë biography, Jane Austen biography, Great Expectations)
    from this photo - matched to biographies/companion volumes rather than
    the actual novels in a couple of cases, a book-matching-layer ranking
    nuance (same family of issue item 16 fixed a different instance of), not
    an OCR problem, and out of scope for this migration.
  - The plain-cover shelf photo (14-15 books) matched 5 books, including the
    exact "Uncommon Service" case Step 1 flagged as a real win (author
    surnames "FREI"/"MORRISS" both read correctly) - now confirmed working
    all the way through to a match, not just an isolated OCR reading. Also
    correctly matched "The Spider Network" from badly fragmented OCR
    ("Matn Genius," "Gang of", "Bankers", "Greatest Scams", "David") and
    "Grasping the Grape".
- **Timing**: total pipeline time for the 15-spine shelf photo was ~81s
  (segmentation 0.8s, OCR stage ~26s with the concurrency/downsizing above,
  Google Books matching ~54s - matching, not OCR, is now the dominant cost).
  This is what motivated item 11 below (make scanning async) and the Google
  Books concurrency fix bundled into it.

**Flipping the default to production (31 July 2026):** `OCR_PROVIDER` is now
`easyocr` by default in both `backend/.env`/`.env.example` and Railway's
production environment (`OCR_PROVIDER`/`OCR_SERVICE_URL`/`OCR_SERVICE_TOKEN`
all added there). Verified live in production, not just locally: registered
a throwaway account against the real Railway URL, ran a real shelf photo
through `POST /api/scan/shelf`, and confirmed both that it completed without
a database error and that the extracted text matched EasyOCR's known
signature for that exact photo (fragmented tokens like `"TRIRE"`,
`"FFRRICC"`, `"GRASPING"` - Tesseract reads that same photo completely
differently). Test account cleaned up afterward.

**A real bug found while flipping the default, not a new regression:**
`ocr/index.js` read `process.env.OCR_PROVIDER` at module load time, but
`server.js` (and every test script) calls `dotenv.config()` *after* its own
`import` statements in source order - and ESM hoists all imports above other
top-level code, so `ocr/index.js` (imported transitively via
`scanController.js` → `bookRecognitionService.js`) always evaluated before
`dotenv.config()` ran, silently defaulting to `'tesseract'` regardless of
what `OCR_PROVIDER` was actually set to, in production as well as locally.
This had been true since `easyocr` was added as an option - never caught
earlier because every prior test happened to use a shell-level
`OCR_PROVIDER=easyocr` override, which sidesteps the bug entirely (shell env
vars are already in `process.env` before any code runs). Fixed by reading
`process.env.OCR_PROVIDER` lazily inside `recognizeImage()` instead of at
module scope - see CLAUDE.md's "Hard-won technical gotchas" for the general
pattern, since this class of bug can recur in any new module that reads
`process.env.X` at top-level scope.

A second, unrelated production gap surfaced by that same test scan is
covered under item 11 below (Railway's start command was skipping the
database migration entirely).

**Hosting decision folded into this item:** was originally its own backlog
entry ("Hosting review") before this OCR work made it concrete. No longer
hypothetical once a self-hosted PyTorch-based OCR service (EasyOCR/
PaddleOCR) was decided on - loading such a model typically needs several
hundred MB to 1GB+ of RAM before processing a single image, running as a
second, mostly-idle service alongside the existing Node backend. Unlikely to
fit comfortably on Railway's free plan, and a cold start on an idle
free-tier service would compound with the scan-time problem (item 11).

Ranked against this specific workload (Node + Postgres + a bursty,
RAM-heavy OCR service, low personal-use volume):

- **Render** — ruled out. Already worse cold starts (~50s) than Railway on
  a *lighter* workload; a model-load step on top makes it worse.
- **Hetzner / DigitalOcean VPS** (~EUR 4-5/month) — strongest fit for raw
  resources: one box with a fixed, real chunk of RAM (~4GB on a Hetzner CX22
  at that price) that both services share as plain processes/containers, no
  per-service platform caps to negotiate. Cost: self-managing OS updates,
  deploys, and uptime.
- **Fly.io** — better match for the *usage pattern*: supports machines that
  scale to zero when idle, so the OCR service only spins up (and only costs,
  on usage-based pricing) when a scan actually happens, rather than paying
  for an always-on model that's idle most of the time. Still Docker-based,
  keeps more deploy convenience than a bare VPS.
- **Modal** (serverless Python ML inference) — purpose-built for a bursty,
  RAM-heavy, occasionally-used model: no Dockerfile or process supervision to
  write, model weight caching and scale-to-zero handled by the platform. Free
  Starter plan includes $30/month credit; CPU pricing (~$0.0000131/core-sec)
  puts personal-volume usage a small fraction of that. Real tradeoff: some
  lock-in — the OCR logic itself stays portable plain Python, but the
  deployment wrapper is Modal's own SDK, not a plain Dockerfile.
- **Oracle Cloud "Always Free" ARM VM** — a bare Ampere A1 VM, run as a
  completely standard Docker container. Zero platform-specific API, same
  portability as Railway/Hetzner/DO. Note: Oracle quietly halved the Always
  Free Ampere A1 allowance (4 OCPU/24GB → 2 OCPU/12GB) on 15 June 2026 with no
  announcement, and some running instances were shut down without warning —
  a real signal the free tier's terms aren't fully stable.

**First decided: Oracle Cloud Always Free ARM VM** — chosen over Modal
specifically for lock-in: a bare VM running a standard Docker container is
as portable as Railway's setup today — no proprietary SDK to rewrite if it's
ever migrated away from. The ops work Oracle requires (Dockerfile, process
supervision via systemd, keeping the box patched) was the reason Modal was
under consideration, but was being accepted since it'd be handled directly
rather than by the account owner.

**Superseded: pivoted to Modal.** Oracle's own account/VM setup proved
difficult enough in practice on the account owner's end (account creation,
payment-method verification, region selection, and VM provisioning all have
to happen through Oracle's own console under the account owner's login - not
something that can be done on someone's behalf) that it wasn't worth pushing
through. Modal was already the documented fallback for exactly this. The
lock-in tradeoff accepted by choosing Modal is unchanged from the comparison
above: some vendor lock-in in the deployment wrapper, in exchange for no
VM/account setup or ongoing ops work at all - the account owner does a
one-time `modal setup` login (opens a browser, stores credentials locally,
no token ever shared) and everything else (writing the Python function,
`modal deploy`, wiring it to the Node backend) is handled directly.

Migration off either host would be easy: standard Node + Postgres using
`DATABASE_URL`, no Railway-specific APIs, no lock-in on the app's own side.

### 4. ISBN barcode scanning as a parallel capture mode — DONE (31 July 2026)
Not a replacement for spine scanning — a complementary path. A barcode scan is
near-100% accurate versus 13-70% for spine OCR, so for bulk-cataloguing a large
collection it is by far the most reliable route. Client-side JS libraries
(`@zxing/library`, `quagga2`) do this in-browser, so it needs no backend work.

Built as a background decode loop inside the existing camera view
(`useBarcodeScanner.js`, wrapping `@zxing/browser`'s `BrowserMultiFormatReader`)
rather than a separate fourth method the user has to pick upfront - see item
10 below for why. Confirmed no backend changes were needed: a detected ISBN
is looked up via the already-working `scanAPI.searchExternal({ type: 'isbn' })`
→ `searchByISBN` in `bookRecognitionService.js`, and added via the existing
`scanAPI.batchAdd` with a 1-item array. Restricted to EAN-13/UPC-A formats so
a decode only ever fires on an actual checksum-passing barcode, never on
ordinary spine text.

The sandboxed browser used for building this blocks real camera access
(`getUserMedia` returns `NotAllowedError` unconditionally), so the decode
loop itself couldn't be tested end-to-end there - only checked against the
zxing library's own docs/source and a clean production build. **Confirmed
working against a real physical barcode by the account owner (31 July
2026)** - fully verified now, nothing outstanding on this item.

### 10. "Add" flow: separate method selection from camera access — DONE (31 July 2026)
Real bug, not just a naming issue: `CameraScanner.jsx` requested camera
permission unconditionally in a `useEffect` on mount
(`requestCameraPermission()`), before the user had chosen anything.

Fixed exactly as scoped: `Scan.jsx` was rewritten as `Add.jsx` (route
`/scan` → `/add`, `Navbar.jsx` relabeled "Scan" → "Add" with a `FaPlus`
icon) with a method-selection start screen - Take Photo / Upload Photo /
Enter Manually - and `CameraScanner` (and its `getUserMedia` call) now only
ever mounts once "Take Photo" is chosen. Verified in-browser: camera
permission is not requested on page load, only after that explicit choice.

The "one source of truth" lean was taken: `Library.jsx`'s manual-add modal
form was extracted into a shared `frontend/src/components/Books/ManualAddForm.jsx`
(props: `onSuccess`/`onCancel`/`initialValues`), used both by `Library.jsx`'s
quick-add modal and inline on the Add page's "Enter Manually" method -
verified both call sites still add a book correctly, through the same code.

Barcode scanning (item 4) ended up folded into "Take Photo" itself rather
than becoming a fourth method - see item 4 above.

### 11. Make scanning asynchronous — DONE (31 July 2026)
Scanning currently blocks an HTTP request for 6-40 seconds (this grew to
~80s for a dense shelf after the EasyOCR migration, see item 2 - Google
Books matching, not OCR, ended up the dominant cost). That is fragile on
any host and gets worse as shelves get denser — `MAX_SPINES` is capped at 24
purely to bound request time, which means a very dense shelf still silently
drops books. Submitting a job and polling for the result removes the entire
timeout failure class and makes the spine cap unnecessary.

**This is the right fix for scan timeouts — not a faster host.**

Built as designed: `scan_sessions` gained `status`/`result`/`error` columns
(both a fresh `CREATE TABLE` definition and `ALTER TABLE ... ADD COLUMN IF
NOT EXISTS` for the already-existing real database, since `migrate.js` just
re-runs the whole schema file and `CREATE TABLE IF NOT EXISTS` doesn't
retroactively add columns). `POST /api/scan/shelf` now inserts a
`'processing'` row and responds `202` immediately (verified: 0.24s, down
from tens of seconds), then runs the actual OCR+matching pipeline in a
detached async function that updates the row to `'completed'`/`'failed'`
when done. New `GET /api/scan/status/:id` polls it. `Add.jsx` polls every
2.5s and renders the exact same results UI once `completed`, just fed from
the status response instead of the original request's response.

Verified end-to-end via curl against a real photo: immediate 202 with a
`scanSessionId`, then polling transitioned `processing` → `completed` with
the same 4 books a direct pipeline call produces.

Accepted, not solved: no persistent job queue exists (no Redis/BullMQ) - the
job is an in-process detached async function, so a server restart mid-scan
(Railway redeploys on every push) would strand that one row in `processing`
forever. Fine for single-user personal-use volume; a real queue would be
disproportionate effort for this.

**Production gap found and fixed (31 July 2026):** this feature shipped
with a broken schema migration in production for a period, unrelated to the
code above. Railway's start command was just `npm start`, not
`npm run db:migrate && npm start` as `DEPLOYMENT.md` recommends - so the
`status`/`result`/`error` columns above never actually got created on the
real production database, meaning every real scan attempt would have
returned a Postgres "column does not exist" error. Fixed by updating
Railway's start command to include the migrate step (safe to run on every
boot - the migration is idempotent `ADD COLUMN IF NOT EXISTS`). Confirmed
fixed via a full production test: registered a throwaway account against
the real Railway URL, ran an actual scan, and confirmed it completed with
real results instead of erroring. **Lesson for next time**: after *any*
change to `backend/src/db/schema.sql`, explicitly check Railway's start
command includes the migrate step before assuming it applied - don't rely
on it having always been true.

Alongside this, `bookRecognitionService.js`'s `scanShelfImage` also had its
per-candidate Google Books lookup loop parallelized (bounded concurrency 5,
via a `mapWithConcurrency` helper shared with `easyocrProvider.js` - now
lives in `backend/src/utils/concurrency.js`). This was the loop actually
responsible for most of the ~80s figure above; verified against a real photo
that the matching stage dropped from ~54s to ~25s with identical books
matched, before the async change on top of it.

### 13. Public test endpoints are unauthenticated — DONE (30 July 2026)
`backend/src/routes/test.js` mounted two routes with no auth and no rate limit,
live on the public Railway URL:

- `POST /api/test/upload` — accepted file uploads from anyone and wrote them to
  disk. Images under 10MB only, but with no rate limit and no auth, someone
  could have filled the disk.
- `GET /api/test/google-books` — burned Google Books API quota on demand.

Both routes and their controller were deleted rather than gated: they were
debugging aids from commit `018777e`, the frontend never called them, and
their diagnostic value is now covered elsewhere (`/health` for liveness,
explicit Google Books error logging for a bad API key, and `backend/tests/test-image.js`
locally). Gating would have left unmaintained code on a public surface.

Recoverable from git history if ever needed.

### 14. Re-test with a full-resolution phone photo — DONE (30 July 2026)
Tested with two real photos found online (no phone photo available yet):
an 8256x5504 shot of decorative Penguin Clothbound Classics, and a 5996x4000
shot of a plain-cover shelf (14-15 books). Both far exceed the 3000-4000px
phone-photo range this item was waiting for. Findings:

- **Resolution is ruled out as the bottleneck.** Character heights were huge
  on both images; the one spine that OCR'd cleanly on image 1 (Great
  Expectations, plain background) matched correctly on the first try.
- **Segmentation is solid when spines have reasonable contrast** — 15 regions
  detected for ~14 real books on image 2, only a minor over-split. But it
  **fails badly on adjacent low-contrast/dark-toned spines**: on image 1,
  three books (Sherlock Holmes, Jane Austen, Jane Eyre — all dark, ornate,
  gold-foil) were merged into a single 3880px-wide region. This is a real bug
  in `spineSegmentation.js`, independent of OCR, not covered by the original
  900px test set.
- **Tesseract itself is the dominant remaining failure**, in two distinct
  ways neither of which is a resolution or threshold problem: (1) it read
  nothing on 3 of 4 correctly-segmented spines with decorative background
  patterns (diamonds, dots, botanical illustrations) despite human-legible
  text; (2) on image 2's plain covers, it also read nothing on bold
  high-contrast display-font spines ("The 500", "Uncommon Service") while
  reading plain-serif/sans spines ("The Rivals", "Golf Is Where You Find It")
  perfectly. Confirmed by inspecting the saved crops directly — these are not
  marginal, hard-to-read cases.

Google Books also returned intermittent 503s during the second test run
(known flakiness under rapid re-testing, see gotchas in CLAUDE.md) — discount
that run's match counts specifically, the OCR-stage findings above are
unaffected.

**Conclusion: this determined the answer for item 2 above** — don't tune
Tesseract further (items 15-16 aside, which are matching-layer, not
OCR-provider, concerns); replace it.

### 15. Line-confidence threshold is discarding useful words — DEPRIORITIZED (30 July 2026)
`MIN_LINE_CONFIDENCE = 55` in `tesseractProvider.js` threw away the word
"Wildwood" — the single most searchable word on that spine — while keeping the
generic "A Journey". The matching layer is now much better at rejecting
nonsense than when that threshold was set, so lowering it and letting the
two-word rule filter may well raise recall. Cheap to test.

Superseded by item 2: Tesseract is being replaced, not tuned further. Item
14's real-photo tests showed Tesseract failing on cases that aren't a
threshold problem (whole spines returning zero words despite ample
resolution and contrast). Kept here for reference in case Tesseract is ever
revisited.

### 16. Ranking picks the wrong edition when OCR is correct — DONE (30 July 2026)
Root-caused with a live Google Books query for `PAINT BY NUMBER` (the exact
real candidates are now hardcoded as fixtures in `backend/tests/test-matching.js`,
so this doesn't need a repeat API call to verify). Two distinct bugs in
`scoreCandidate`, both in `bookRecognitionService.js`:

1. **Author-field double-counting.** Cheap colouring/activity books often
   have their `authors` field filled with a brand-name imprint that echoes
   the title itself (e.g. "Paint Number Publishing" on a book titled "Paint
   by Number"). The scanned words "paint"/"number" were counted once at 1x
   via the title match *and again* at AUTHOR_WEIGHT's 3x via that same-brand
   "author" - the same evidence double-counted as two. Fixed by making the
   title/author/subtitle checks exclusive per token (title takes priority,
   then author, then subtitle), so a token already explained by the title
   can't also trigger the author bonus.
2. **Subtitle text weighted the same as the title.** With bug 1 fixed, "Real
   Art! The Paint by Number Book & Kit" (by Douglas Brenner) still
   outscored the correct book, because its short combined title+subtitle
   had fewer unmatched words than the correct book's longer subtitle ("How
   to Craz That Swept the Nation") - even though the scanned words only
   appear in *that* book's subtitle, not its actual title ("Real Art!").
   Fixed by scoring title-field and subtitle-field matches separately, with
   subtitle-only matches worth half of a title match (`SUBTITLE_WEIGHT = 0.5`).

Added `backend/tests/test-matching.js` as a synthetic regression test - pure
function, no network calls, using the real captured candidate data. Verifies
both the Paint by Number fix and the original Dune-vs-critical-companion case
AUTHOR_WEIGHT was built for, to guard against fixing one at the expense of
the other. Wired in as `npm run test:matching`.

### 17. Manual book entry — DONE (30 July 2026)
Added a modal form on the Library page (title required, everything else
optional) using the existing `POST /api/books`. Also fixed the dedupe bug
this surfaced: `addBook` matched catalogue rows with `WHERE isbn = $1 OR
title = $2`, and since `NULL = NULL` is never true in SQL, an ISBN-less
manual entry fell through to matching on title alone — silently merging any
two different books sharing a title. Verified: the same title+author
submitted twice now correctly reuses the catalogue entry and flags
`is_duplicate`; the same title with a different author gets its own entry.

### 18. Reading status + star rating — DONE (30 July 2026)
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

### 19. Debug scripts in `backend/` — DONE (30 July 2026)
Moved `test-google-api.js`, `test-ocr.js`, `test-segmentation.js` and
`test-image.js` from the backend root into `backend/tests/`, fixed their
relative imports (`./src/...` → `../src/...`), and added `npm run test:ocr`,
`test:segmentation`, `test:image`, and `test:google-api` scripts. Plain
`npm test` (Jest) still finds nothing — there are no unit tests yet, only
these standalone diagnostics; that's unchanged and out of scope here.
CLAUDE.md's testing-tools section updated to match.
