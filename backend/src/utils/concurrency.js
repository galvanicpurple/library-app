// Runs `fn` over `items` with at most `limit` calls in flight at once,
// preserving result order. Used wherever work items are independent,
// stateless requests (OCR calls to Modal, Google Books lookups) rather than
// something with shared state that would need to run one at a time.
export const mapWithConcurrency = async (items, limit, fn) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
};
