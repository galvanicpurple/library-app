# LibraryApp

Personal library manager: scan a bookshelf with a phone camera, auto-identify
books via OCR + Google Books, catalogue them, flag duplicates, track reading
status, get recommendations. Built across several sessions with Claude Code;
this file is a handoff for picking the work back up in a fresh session.

**Start here:** read [BACKLOG.md](BACKLOG.md) — it's the live, ordered work
plan (18 items, some done, most not). This file is orientation and gotchas;
BACKLOG.md is what to actually do next.

**Single most important next step:** item 3 in the backlog. Everything about
scan accuracy measured so far was on a 900px test photo (13% recall). A real
phone photo (3000-4000px) is expected any session now and decides whether we
keep tuning Tesseract or switch to Cloud Vision. Don't do further OCR tuning
before that lands unless asked.

## Architecture

- **Backend**: `backend/` — Node/Express, ESM (`type: module`), Postgres via
  `pg`. Deployed on Railway.
- **Frontend**: `frontend/` — React + Vite, plain CSS (no framework),
  Zustand for auth state. Deployed on Vercel.
- **OCR pipeline**: `backend/src/services/ocr/` — provider-agnostic by
  design (`index.js` picks a provider via `OCR_PROVIDER` env var, defaults
  to `tesseract`). `tesseractProvider.js` does the actual recognition;
  `spineSegmentation.js` splits a shelf photo into individual book-spine
  crops before OCR runs on each one. Adding Cloud Vision later means one new
  file matching the same `{ fullText, lines }` shape — no changes anywhere
  else.
- **Book matching**: `backend/src/services/bookRecognitionService.js` —
  turns OCR'd text into Google Books matches. Has real anti-garbage logic
  (relevance scoring, author-weighted matching, two-corroborating-words
  rule) built up through several rounds of testing against real book covers.
- **Recommendations**: `backend/src/services/recommendationService.js` —
  depends on `readings.status = 'completed' AND rating >= 4`. This was
  completely dead until 30 July 2026 (see backlog item 14) because no UI
  could write a `readings` row; now fixed and wired up via the Library page.

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

## Testing tools (all in `backend/`, run before pushing anything OCR/matching-related)

- `node test-ocr.js` — 4 synthetic regression cases (cover, low-contrast
  cover, single spine, 3-spine shelf). Fast, no real photos needed.
- `node test-segmentation.js` — 5 cases for spine boundary detection
  specifically, including leaning/sheared books and negative cases (single
  cover or lone spine should decline to segment).
- `node test-image.js <path> [--save-crops]` — runs a **real photo** through
  the full pipeline (segmentation → OCR → matching) and reports each stage
  separately with timing. This is *the* tool for diagnosing a real scan
  failure — it shows which stage broke rather than just a final wrong
  answer. `--save-crops` writes each detected spine to `backend/crops/`
  (gitignored) so you can visually check the cuts landed correctly.

None of these are wired into `npm test` yet (backlog item 18).

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
