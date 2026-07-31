# LibraryApp

Personal library manager: scan a bookshelf with a phone camera, auto-identify
books via OCR + Google Books, catalogue them, flag duplicates, track reading
status, get recommendations. Built across several sessions with Claude Code;
this file is a handoff for picking the work back up in a fresh session.

**Start here:** read [BACKLOG.md](BACKLOG.md) — it's the live, ordered work
plan. Active work is grouped by theme (Security/correctness, Scan accuracy,
Features, Infrastructure); finished, decided, or deprioritized items move to
a "Completed / Resolved" section at the end instead of being deleted, so you
can see *why* something was decided, not just that it was. This file
(`CLAUDE.md`) is orientation, architecture, and gotchas - BACKLOG.md is what
to actually work on.

## Current state (as of 31 July 2026)

Everything planned as of the last session is **built, deployed, and verified
in production** - there is no pending decision or half-finished feature
right now:

- **OCR runs on EasyOCR, not Tesseract** (BACKLOG.md item 2). Self-hosted on
  Modal (a serverless Python host), not a third-party API like Google Cloud
  Vision, for privacy (photos never leave your own infrastructure). This is
  a real, verified accuracy improvement - Tesseract read *nothing* on many
  decorative or stylized-font book spines; EasyOCR reads real, matchable
  text off the same photos. See item 2 for the details and measurements.
- **Adding a book has three methods** behind one "Add" nav entry
  (`frontend/src/pages/Add.jsx`, item 10): take a photo, upload a photo, or
  type it in by hand. Taking a photo also runs a live barcode scanner in the
  background (item 4) - point the camera at a barcode and it adds that exact
  book immediately, no separate "barcode mode" needed. **Confirmed working
  against a real physical barcode by the account owner.** This gives a
  reliable fallback for books whose spine or cover doesn't OCR well - most
  books printed after the 1970s have a barcode somewhere.
- **Scanning a shelf photo is asynchronous** (item 11): submitting a photo
  returns immediately, and the page polls for results in the background,
  instead of one browser tab sitting frozen for up to 80 seconds.
- All of the above is confirmed working **in production**, not just in
  local testing - verified by running a real scan against the live Railway
  backend with a throwaway test account (see "Verifying a real fix in
  production" under Deployment below for why that's the right way to check
  this, since there's no staging environment).

**If you're picking up fresh with no specific task assigned:** BACKLOG.md
item 3 (a real-photo benchmark set with known-correct answers) is probably
the highest-leverage next step - every accuracy claim so far has been
checked against just 1-2 photos by hand, which makes it hard to trust
whether a future change actually helps or quietly regresses something.
Otherwise, just read BACKLOG.md's "Active" sections top to bottom and pick
whatever matches what you've been asked to do.

For the full history of *how* the EasyOCR/Add-flow/async-scanning work
above was decided and built (Modal vs. other hosts, EasyOCR vs. other OCR
engines, the exact bugs hit and fixed), see BACKLOG.md items 2, 4, 10, and
11 - this file intentionally doesn't repeat all of that narrative.

## Architecture

- **Backend**: `backend/` — Node/Express, ESM (`type: module`), Postgres via
  `pg`. Deployed on Railway.
- **Frontend**: `frontend/` — React + Vite, plain CSS (no framework),
  Zustand for auth state. Deployed on Vercel.
- **OCR pipeline**: `backend/src/services/ocr/` — provider-agnostic by
  design (`index.js` picks a provider via the `OCR_PROVIDER` env var,
  currently defaulting to **`easyocr`**; `tesseract` still exists as a
  fallback option, see BACKLOG.md item 2). `tesseractProvider.js` runs
  recognition in-process. `easyocrProvider.js` instead makes an HTTP call
  out to a Modal-hosted EasyOCR service (`ocr-service/app.py`, deployed
  separately with `modal deploy` - built against `modal==1.5.3`,
  `easyocr==1.7.2`, auth via a shared-secret `Authorization: Bearer <token>`
  header) - crops are downsized before upload and OCR'd with bounded
  concurrency (6 at a time), since each call is an independent stateless
  request rather than a shared in-process worker. Both resolve to the same
  `{ fullText, lines: [{ text, confidence, rotation, bbox }] }` shape.
  `spineSegmentation.js` splits a shelf photo into individual book-spine
  crops before OCR runs on each one - shared by both providers, not
  provider-specific. Full deploy/auth/gotcha detail lives in
  `ocr-service/README.md`, not repeated here.
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
- **Push to `main` auto-deploys both Railway (backend) and Vercel
  (frontend).** There is no CI — a push is live within minutes. Always run
  the relevant test script(s) before pushing (see Testing below); there's no
  safety net otherwise.
- Production URLs: frontend `https://library-app-frontend-five.vercel.app`,
  backend `https://libraryapp.up.railway.app` (its `/health` endpoint is
  public, no auth needed - the fastest way to check a deploy actually went
  through).
- **Railway's start command must be `npm run db:migrate && npm start`, not
  just `npm start`.** This wasn't true for a while and nobody noticed until
  a schema change (item 11) silently never applied to production - the
  migration only ever ran locally. The migration script is idempotent
  (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), so it's safe to
  run on every single boot, not just the first one. If you add a new column
  to `backend/src/db/schema.sql`, don't assume it reached production - check
  this.
- **Verifying a real fix in production**: there's no staging environment, so
  the reliable way to check something actually works live (not just
  locally) is to register a throwaway account against the real production
  API (`POST /api/auth/register` on the Railway URL above) and exercise the
  actual feature through it, then clean up. **There's no self-service
  "delete my account" endpoint** (BACKLOG.md item 20), so cleanup means
  either running `DELETE FROM users WHERE email = '...'` yourself via
  Railway's dashboard (open the **Postgres service** - not the backend
  service - and look for a "Data" tab, which usually has a way to run raw
  SQL), or asking the account owner to run it, since production database
  credentials shouldn't be pasted into a chat session. The delete cascades
  to that user's books/shelves/scans automatically via existing foreign-key
  constraints - nothing else needs cleaning up by hand.
- Real user account exists in the shared Postgres DB: `isaacchai@hotmail.com`
  / "Isaac Chai". **Never modify or delete this account or its data.**

## Local dev environment — gotchas that cost real time this session

- **`frontend/.env` points at a LAN IP** (`192.168.68.106`) for the user's
  phone testing over the local network. It is **not reachable from a sandboxed
  session**. A `frontend/.env.local` (gitignored, already created) overrides
  it to `http://localhost:5000/api` for local testing — don't edit the
  tracked `.env`, it's the user's actual setup.
- **Stale processes silently squat on port 5000 (backend) and 5173
  (frontend), across sessions, not just within one.** A `npm run dev`/
  `npm run build`+preview left running from a *previous* session is still
  there when a new session starts. Backgrounding a fresh `npm run dev` when
  something's already listening produces an `EADDRINUSE` crash in the *new*
  process while the *old* one keeps serving stale code - and
  `curl http://localhost:5000/health` will happily return 200 from the
  zombie, giving false confidence that a fix is live. Always check first,
  and re-check after killing (killing and immediately restarting can itself
  race - the OS may not have released the port yet, causing the *new*
  process to also fail with `EADDRINUSE`; if that happens, just wait a
  couple seconds and retry):
  ```bash
  netstat -ano | grep ":5000" | grep LISTENING   # note the PID (repeat for :5173)
  taskkill //F //PID <pid>
  # then verify the port is actually free before restarting:
  netstat -ano | grep ":5000" | grep LISTENING   # should print nothing
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

- **Reading `process.env.X` at the top level of a module (not inside a
  function) is fragile in this codebase, and it silently broke production
  for an unknown period of time.** `server.js` imports its route files
  *before* calling `dotenv.config()` in its own source code - normally
  harmless, except JavaScript's ES module system hoists every `import`
  statement above all other code in a file, including ones written after
  `dotenv.config()`. So any file that gets imported (even indirectly, through
  several other files) and reads `process.env.SOMETHING` as a top-level
  `const` will see `undefined` at that moment, because `dotenv.config()`
  hasn't run yet - it evaluates a `.env` file into `process.env`, but only
  once the *importing* file's own code starts running, which is after every
  import has already been resolved. This exact bug made
  `backend/src/services/ocr/index.js`'s provider selection always silently
  fall back to `'tesseract'`, no matter what `OCR_PROVIDER` was set to
  anywhere - `.env`, `.env.example`, even Railway's real production
  environment variables. It went unnoticed because every test during
  development happened to set `OCR_PROVIDER` as a shell-level environment
  variable instead (`OCR_PROVIDER=easyocr npm run test:...`), which sidesteps
  the whole problem - a variable set directly in the shell is already
  present in `process.env` before Node even starts, so timing doesn't matter
  for it.
  **The fix, and the rule going forward:** read `process.env.X` *inside* a
  function (at the moment it's actually called), not as a top-level `const`
  - by the time any request is actually being handled, `dotenv.config()` has
  long since finished, so a read at that point is always safe. (The
  alternative used by `backend/src/db/db.js` - calling `dotenv.config()`
  again at the top of that specific file - also works, since it doesn't
  depend on some *other* file having already called it, but reading lazily
  is simpler and doesn't require remembering to do this in every new file.)
  **If you add any new module that reads an env var at module scope, this is
  the bug to check for first if it doesn't seem to pick up its config.**
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

## Verifying the frontend in a sandboxed browser

The Browser pane used to click through the app during development behaves
differently from a real user's browser in a few ways that look like bugs at
first but usually aren't:

- **It cannot grant real camera access.** `getUserMedia` always fails with
  `NotAllowedError`, even for a feature that works fine on a real phone or
  laptop. This means camera-dependent features (the live barcode scanner,
  taking an actual photo) can only be checked by reading the code carefully
  and confirming a clean build - not by actually watching them work. Get a
  real person with a real device to confirm those before trusting them
  fully (this is exactly what happened with barcode scanning - confirmed
  separately by the account owner on a real device).
- **A toast notification can get stuck on screen indefinitely**, unlike a
  real browser tab. `react-toastify` is configured with `pauseOnFocusLoss`,
  which pauses a toast's auto-dismiss timer whenever the tab loses focus -
  and the sandboxed browser never sends the normal focus/blur events a real
  browser tab would, so a toast's timer can just never resume. A stuck toast
  sitting in the corner can visually and functionally block clicks on a
  nearby button (e.g. a modal's close button in the same corner) - if a
  click that should work appears to silently do nothing, check whether a
  leftover toast is actually sitting on top of it before assuming the
  button itself is broken.
- **Clearing only `localStorage`'s `token` key isn't the same as logging
  out.** This app's auth state lives in two places at once: Zustand's own
  persisted state (under the `auth-storage` key) and a separate, plain
  `localStorage.setItem('token', ...)` written alongside it. The app's real
  `logout()` function clears both correctly - but manually removing just
  `token` (e.g. while resetting state between manual tests) leaves Zustand
  still believing `isAuthenticated: true`, so the app keeps rendering pages
  as if logged in while every actual API call silently fails with 401. If
  you need to reset auth state by hand rather than clicking "Logout", clear
  everything (`localStorage.clear()`), not just one key.

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
