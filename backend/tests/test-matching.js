// Regression tests for pickBestMatch/scoreCandidate in bookRecognitionService.js.
// Pure function, no network calls - book candidate lists here are real Google
// Books API responses captured for these exact queries, not invented data.
//
// Run with: node tests/test-matching.js

import { pickBestMatch } from '../src/services/bookRecognitionService.js';

let passed = 0;
let failed = 0;

function check(name, actualTitle, actualAuthors, expectedTitle) {
  const ok = actualTitle === expectedTitle;
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}: got "${actualTitle}" by ${(actualAuthors || []).join(', ') || 'unknown'}, expected "${expectedTitle}"`);
  if (ok) passed += 1; else failed += 1;
}

// Backlog item 6: OCR correctly read "PAINT BY NUMBER" but matching returned
// a children's colouring book instead of William Bird's Paint by Number.
// Root cause (found via a live query against these exact candidates): the
// colouring book's "authors" field is the brand name "Paint Number
// Publishing", which coincidentally contains both query words. Before the
// fix, that tripped AUTHOR_WEIGHT's 3x bonus on top of the same words
// already counting once via the title - double-counting one signal as two,
// letting it outscore the real, correctly-titled book.
const paintByNumberCandidates = [
  {
    title: 'Paint by Number',
    subtitle: 'How to Craz That Swept the Nation',
    authors: ['William L. Bird'],
    publisher: 'Princeton Architectural Press',
    pageCount: 148,
    categories: ['Art'],
  },
  {
    title: 'The Official Paint By Numbers Guide: Master the Secrets to Paint By Numbers',
    authors: ['Logan Ransley'],
    publisher: 'Independently Published',
    pageCount: 66,
    categories: ['Education'],
  },
  {
    title: 'Paint by Number Under Water Book for Kids',
    subtitle: 'Sea Paint by Number Coloring Book Gift for Kids and Toddlers, Ocean Animals Color by Numbers Coloring Book',
    authors: ['Paint Number Publishing'],
    pageCount: 110,
    categories: [],
  },
  {
    title: 'Real Art!',
    subtitle: 'The Paint by Number Book & Kit',
    authors: ['Douglas Brenner', 'Nancy Stahl'],
    publisher: 'Workman Publishing',
    pageCount: 0,
    categories: ['Paint-by-numbers'],
  },
];

{
  const match = pickBestMatch('PAINT BY NUMBER', paintByNumberCandidates);
  check('scanned "PAINT BY NUMBER" picks the real book, not the colouring book', match?.title, match?.authors, 'Paint by Number');
}

// Original motivating case for AUTHOR_WEIGHT (see comment above its
// definition): a scanned "DUNE FRANK HERBERT" spine should prefer the novel
// itself over a book written *about* it, since only the novel's author field
// genuinely corroborates the scanned author name. Guards against the fix
// above accidentally weakening real author corroboration.
const duneCandidates = [
  { title: 'Dune', authors: ['Frank Herbert'], categories: ['Fiction'] },
  {
    title: "Frank Herbert's Dune: A Critical Companion",
    authors: ['Kara Kennedy'],
    categories: ['Literary Criticism'],
  },
];

{
  const match = pickBestMatch('DUNE FRANK HERBERT', duneCandidates);
  check('scanned "DUNE FRANK HERBERT" still prefers the novel over a companion book', match?.title, match?.authors, 'Dune');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
