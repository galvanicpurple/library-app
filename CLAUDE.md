# LibraryApp

Personal library manager: scan a bookshelf with a phone camera, auto-identify
books via OCR + Google Books, catalogue them, flag duplicates, track reading
status, get recommendations. Built across several sessions with Claude Code;
this file is a handoff for picking the work back up in a fresh session.

**Start here:** read [BACKLOG.md](BACKLOG.md) — it's the live, ordered work
plan (19 items). Active work is grouped by theme at the top (Security /
correctness, Scan accuracy, Features, Infrastructure); fully finished,
decided-and-closed, or deprioritized items are kept in a separate
"Completed / Resolved" section at the end, not deleted. This file is
orientation and gotchas; BACKLOG.md is what to actually do next.

**Immediate next action:** two decisions are now waiting on the account
owner, neither requires more building:

1. Item 2 (OCR provider migration, Tesseract → EasyOCR on Modal) is
   **built and verified end-to-end** (30 July 2026) - the Modal endpoint is
   deployed, `easyocrProvider.js` exists and is wired into
   `OCR_PROVIDER=easyocr`, and both real test photos from item 14 show a
   substantial, real accuracy improvement over Tesseract (see BACKLOG.md
   item 2's "Steps 2-5 findings"). Whether to flip `OCR_PROVIDER` to
   `easyocr` as the default (still `tesseract` in `backend/.env`/
   `.env.example`) and add `OCR_PROVIDER`/`OCR_SERVICE_URL`/
   `OCR_SERVICE_TOKEN` to Railway's production environment is left to the
   account owner - it changes live scan behavior and starts drawing on
   Modal's free-tier credits on every real scan, not just test runs.
2. Items 4, 10, and 11 (Add-flow redesign with barcode scanning, and async
   shelf scanning) are **also built and verified** (31 July 2026) - see
   BACKLOG.md for full detail on each. `/scan` is now `/add` with a
   method-selection start screen (Take Photo / Upload Photo / Enter
   Manually), barcode detection runs as a background decode loop inside
   the camera view rather than a separate method, and shelf-photo scanning
   is now asynchronous end-to-end (`scan_sessions` gained a status column,
   `POST /api/scan/shelf` responds in ~0.2s, `Add.jsx` polls
   `GET /api/scan/status/:id`). Nothing here is blocked on a decision -
   these are already live in the codebase (not yet pushed to `main`/Railway
   as of this writing). One real gap: the barcode decode loop was verified
   against `@zxing/browser`'s own API docs and a clean build, but not
   against a real physical barcode - the sandboxed browser used for testing
   this session blocks real camera access. Worth a real-device check before
   relying on it.

Context already done, don't redo it:

- Full-resolution real-photo testing (item 14) already ruled out resolution
  as the bottleneck and confirmed Tesseract itself - not the image quality -
  is the dominant failure, on two axes: decorative background patterns, and
  certain bold/stylized display fonts.
- The provider decision is made: self-hosted **EasyOCR**, not Cloud Vision
  (privacy - won't send photos to Google) and not Tesseract-tuning (item 15,
  deprioritized - the failures aren't a threshold problem).
- Hosting is **Modal** (item 12), deployed at
  `https://galvanicpurple--libraryapp-ocr-ocrservice-recognize.modal.run` -
  see `ocr-service/app.py` and `ocr-service/README.md` for the service itself
  and its deploy/auth/gotchas.
- **Phase 0 (validate EasyOCR) and the full build/verify (steps 2-5) are
  both done** - see BACKLOG.md item 2. Real, substantial improvement over
  Tesseract confirmed against both item-14 real photos, not just isolated
  crops: spines with decorative gold-foil backgrounds and stylized fonts
  that Tesseract read *nothing* off now produce real legible text and, in
  several cases, correct end-to-end book matches (including the exact
  "Uncommon Service" case Phase 0 flagged as a win). The synthetic
  `test:ocr` suite's two spine-image cases fail under `OCR_PROVIDER=easyocr`
  - confirmed to be an expected engine-characteristic difference (EasyOCR is
  scene-text-tuned; those synthetic images are the opposite of scene text),
  not an adapter bug, and not worth chasing parity on given real photos are
  the actual target.
- **Not resolved by this migration alone**: total pipeline time for a dense
  shelf was still ~80s (OCR dropped a lot thanks to downsizing crops +
  bounded concurrency before upload, but Google Books matching dominated at
  ~50s+). This is what motivated items 11 (async scanning) and the Google
  Books concurrency fix, both now done - see below.

**Decisions that were open, now settled by the build:**

- Modal versions built against: `modal==1.5.3`, `easyocr==1.7.2`. The
  `@modal.fastapi_endpoint(method="POST")` decorator is current for 1.5.3 -
  `@modal.web_endpoint` is the older name, don't reach for it.
- Endpoint auth: a shared-secret `Authorization: Bearer <token>` header,
  checked in `ocr-service/app.py` against the `ocr-service-token` Modal
  secret, matching value in `backend/.env` as `OCR_SERVICE_TOKEN`.
- Image transfer format: raw bytes as the POST body (no multipart), one
  image in, one `{ lines: [...] }` JSON response out. `easyocrProvider.js`
  builds the final `{ fullText, lines }` shape on the Node side.
- Cold-start penalty is real and expected (confirmed during verification,
  first-call latency well above warm-call latency) - not a bug, not
  currently worth `min_containers`/keep-warm given personal-use volume (see
  item 12's hosting reasoning). `easyocrProvider.js` also downsizes crops to
  1500px/JPEG-85 before upload and runs up to 6 requests concurrently, both
  of which cut real request time independent of the cold-start question -
  see BACKLOG.md item 2 for the measurements.

## Architecture

- **Backend**: `backend/` — Node/Express, ESM (`type: module`), Postgres via
  `pg`. Deployed on Railway.
- **Frontend**: `frontend/` — React + Vite, plain CSS (no framework),
  Zustand for auth state. Deployed on Vercel.
- **OCR pipeline**: `backend/src/services/ocr/` — provider-agnostic by
  design (`index.js` picks a provider via `OCR_PROVIDER` env var, defaults
  to `tesseract`; `easyocr` is the other option, see BACKLOG.md item 2).
  `tesseractProvider.js` runs recognition in-process. `easyocrProvider.js`
  instead makes an HTTP call out to a Modal-hosted EasyOCR service
  (`ocr-service/app.py`, deployed separately with `modal deploy`) - crops are
  downsized before upload and OCR'd with bounded concurrency (6 at a time),
  since each call is an independent stateless request rather than a shared
  in-process worker. Both resolve to the same
  `{ fullText, lines: [{ text, confidence, rotation, bbox }] }` shape.
  `spineSegmentation.js` splits a shelf photo into individual book-spine
  crops before OCR runs on each one - shared by both providers, not
  provider-specific.
- **Book matching**: `backend/src/services/bookRecognitionService.js` —
  turns OCR'd text into Google Books matches. Has real anti-garbage logic
  (relevance scoring, author-weighted matching, two-corroborating-words
  rule) built up through several rounds of testing against real book covers.
  Per-candidate Google Books lookups run with bounded concurrency (5 at a
  time, via `backend/src/utils/concurrency.js`'s `mapWithConcurrency` -
  shared with `easyocrProvider.js`) rather than one at a time - this stage,
  not OCR, is the dominant cost of a full scan (see BACKLOG.md item 11).
- **Recommendations**: `backend/src/services/recommendationService.js` —
  depends on `readings.status = 'completed' AND rating >= 4`. This was
  completely dead until 30 July 2026 (see backlog item 14) because no UI
  could write a `readings` row; now fixed and wired up via the Library page.
- **Add flow**: `frontend/src/pages/Add.jsx` (route `/add`, formerly `/scan`/
  `Scan.jsx`) - a method-selection start screen (Take Photo / Upload Photo /
  Enter Manually) rather than jumping straight into requesting camera
  access (BACKLOG.md item 10). Barcode scanning (item 4) runs as a
  background decode loop inside the camera view itself
  (`frontend/src/hooks/useBarcodeScanner.js`, wrapping `@zxing/browser`),
  not a separate method. Manual entry is a shared
  `frontend/src/components/Books/ManualAddForm.jsx`, used both here and by
  `Library.jsx`'s quick-add modal - one form, not two maintained copies.
- **Scanning is asynchronous** (BACKLOG.md item 11): `POST /api/scan/shelf`
  inserts a `scan_sessions` row with `status = 'processing'` and responds
  immediately (~0.2s) with a `scanSessionId`; the actual OCR+matching
  pipeline runs in a detached async function
  (`processScanJob` in `scanController.js`) that updates the row to
  `completed`/`failed` when done. `GET /api/scan/status/:id` polls it;
  `Add.jsx` polls every 2.5s. No persistent job queue backs this (no
  Redis/BullMQ) - a mid-scan server restart would strand a row in
  `processing` forever, accepted as a minor, rare cost at personal-use
  volume rather than built out further.

## Deployment

- GitHub: `galvanicpurple/library-app`, `main` branch.
- **Push to `main` auto-deploys both Railway and Vercel.** There is no CI —
  a push is live within minutes. Always run the relevant test script(s)
  before pushing (see Testing below); there's no safety net otherwise.
- Real user account exists in the shared Postgres DB: `isaacchai@hotmail.com`
  / "Isaac Chai". **Never modify or delete this account or its data.** Any
  test accounts created for verification should be cleaned up afterward
  (`DELETE FROM users WHERE email LIKE '...'` — cascades to their books/
  shelves/readings via FK constraints).

## Local dev environment — gotchas that cost real time this session

- **`frontend/.env` points at a LAN IP** (`192.168.68.106`) for the user's
  phone testing over the local network. It is **not reachable from a sandboxed
  session**. A `frontend/.env.local` (gitignored, already created) overrides
  it to `http://localhost:5000/api` for local testing — don't edit the
  tracked `.env`, it's the user's actual setup.
- **Stale nodemon processes silently squat on port 5000.** Backgrounding
  `npm run dev` when something is already listening produces an `EADDRINUSE`
  crash in the *new* process while the *old* one keeps serving stale code —
  and `curl http://localhost:5000/health` will happily return 200 from the
  zombie, giving false confidence that a fix is live. This caused a genuine
  wasted round-trip mid-session (see the `updateReading` fix history in the
  backlog). Always verify before trusting a "it still fails" result:
  ```bash
  netstat -ano | grep ":5000" | grep LISTENING   # note the PID
  # if a fix isn't reflected, taskkill //F //PID <pid> and restart clean
  ```
- **Auth endpoints are rate-limited** (5 requests/15min via `authLimiter`,
  in-memory). Repeated test registrations during a session will 429 —
  restarting the backend resets it.
- Two backend `.env` values worth knowing: `GOOGLE_BOOKS_API_KEY` is real and
  live (don't burn it in tight loops — it hit a 503 once this session from
  rapid re-testing), `DATABASE_URL`/`DB_*` point at a local Postgres with the
  real schema and the real user's data.
- **Python is part of this machine's toolchain** — installed via
  `winget install -e --id Python.Python.3.12` at
  `%LOCALAPPDATA%\Programs\Python\Python312`. `easyocr` (pulls in
  `torch`/`torchvision`, a large install), `modal`, and `fastapi[standard]`
  (needed locally too - see `ocr-service/README.md`) are all already
  `pip install`ed there. `modal setup` has already been run and authenticated
  on this machine — the account owner doesn't need to repeat that
  browser-login step.
  **However: a bare `python`/`pip` in a fresh terminal on this machine
  resolves to the Microsoft Store app-execution-alias stub, not the real
  install** ("Python was not found; run without arguments to install from
  the Microsoft Store...") - `Python312` is not actually first on PATH
  despite being a persistent user install. Use the full path directly
  instead of fighting PATH: `"$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"`
  (PowerShell) or `/c/Users/<user>/AppData/Local/Programs/Python/Python312/python.exe`
  (git-bash), plus its sibling `Scripts\` dir for `pip.exe`/`modal.exe`. Also
  note: **PATH exports don't persist between separate Bash tool calls** in
  this environment (each call is a fresh shell) - either re-export PATH at
  the start of every call that needs `python`/`modal` on it, or just use the
  full path every time.
- **Python scripts that print Unicode (e.g. progress bars with `█`) crash on
  Windows with `UnicodeEncodeError: 'charmap' codec can't encode character`.**
  The default console encoding is cp1252, not UTF-8. Hit this running
  EasyOCR's own model-download progress bar. Fix: set
  `PYTHONIOENCODING=utf-8` and `PYTHONUTF8=1` before running any Python
  script, not just the one that happened to crash — it'll recur with any
  library that prints non-ASCII output.

## Testing tools (all in `backend/tests/`, run before pushing anything OCR/matching-related)

Live in `backend/tests/`, run via npm script from `backend/` (item 18 — moved
out of the backend root and wired up):

- `npm run test:ocr` — 4 synthetic regression cases (cover, low-contrast
  cover, single spine, 3-spine shelf). Fast, no real photos needed.
- `npm run test:segmentation` — 5 cases for spine boundary detection
  specifically, including leaning/sheared books and negative cases (single
  cover or lone spine should decline to segment).
- `npm run test:image -- <path> [--save-crops]` — runs a **real photo**
  through the full pipeline (segmentation → OCR → matching) and reports each
  stage separately with timing. This is *the* tool for diagnosing a real scan
  failure — it shows which stage broke rather than just a final wrong
  answer. `--save-crops` writes each detected spine to `backend/crops/`
  (gitignored) so you can visually check the cuts landed correctly. Two real
  test photos live in `backend/test-images/` (also gitignored — stock photos,
  not ours to redistribute), e.g.
  `npm run test:image -- test-images/teo-zac--rsltmQbEo0-unsplash.jpg`.
- `npm run test:google-api` — sanity-checks `GOOGLE_BOOKS_API_KEY` against a
  live query. Not part of the OCR pipeline; use it when book matching fails
  and you need to rule the API key in or out first.

`npm test` (plain Jest) still finds nothing — there are no unit tests in this
codebase yet, only these standalone diagnostic scripts.

## Hard-won technical gotchas

- **Postgres parameter type unification.** A single `$N` placeholder used
  both positionally (into a typed column, e.g. `varchar`) and inside a
  string comparison (which infers `text`) within *the same statement* will
  be rejected with `42P08 inconsistent types deduced for parameter`, even if
  each individual usage looks fine. The fix is an explicit cast (`$N::varchar`)
  at **every** occurrence of that parameter, not just the comparisons — this
  bit `readingsController.js`'s `updateReading`, and a first fix attempt
  that only cast some occurrences was still broken. If a query with a reused
  parameter throws 42P08, this is why.
- **Tesseract's LSTM engine (tesseract.js's default) silently ignores
  `tessedit_char_whitelist`.** It's a documented no-op
  (tesseract-ocr/tesseract#751), not a bug in this codebase — don't
  reintroduce it expecting it to filter output.
- **OCR needs ~20-30px character height; resolution math matters more than
  settings tuning.** A 900px-wide shelf photo with ~15 spines gives ~7-10px
  characters — no amount of preprocessing or PSM-mode tuning recovers detail
  that was never captured. Always check source image width first when
  debugging a failed scan.
- **Edge detection for spine boundaries must compare colour (RGB), not
  greyscale.** Two adjacent spines can differ by ~250 in RGB while differing
  by only ~10 in greyscale (e.g. dark red next to dark slate) — greyscale
  edge detection misses real boundaries. Also: dilate a peak profile rather
  than averaging it (averaging divides a sharp one-column spike's height by
  the window size, pushing real boundaries below threshold).
- **Matching a scanned title needs corroboration, not just any shared
  word.** A single matched word (e.g. OCR reading only "JONATHAN" off a
  partly-legible spine) confidently matches unrelated real books. The
  two-corroborating-words rule in `bookRecognitionService.js` trades a few
  missed one-word titles for eliminating wrong-but-confident matches — a
  silent wrong book in the library is worse than a miss.

## Conventions observed in this codebase

- Comments explain **why**, not what — especially for anything non-obvious
  enough to have been debugged once already (see the gotchas above; they're
  all documented inline at their point of use, not just here).
- Commit messages are detailed: root cause, fix, and how it was verified.
  Follow that pattern — this repo has no CI, so the commit message is often
  the only record that a fix was actually tested and how.
- Verify UI changes through the actual browser (this session used the
  sandboxed Browser pane + direct React prop invocation, since synthetic
  DOM click/submit events don't reliably reach React's event system in that
  environment — `element[reactPropsKey].onClick(...)` works where
  `element.click()` doesn't). Don't call a fix done from a passing build
  alone if it touches user-facing behaviour.
- No emoji in code, commits, or UI copy unless explicitly requested.
