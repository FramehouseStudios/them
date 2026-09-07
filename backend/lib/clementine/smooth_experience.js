// Smooth experience — debounce, cache, optimistic UI (writing partner smoothness, D009)
const cache = new Map();

export function debounceLivePaper({ projectId, draft, delay = 100 } = {}) {
  const key = String(projectId||"default");
  const now = Date.now();
  const last = cache.get(key);
  if (last && now - last.at < delay) return { cached: true, payload: last.payload };
  const payload = { draft: String(draft||"").slice(0,500), at: now };
  cache.set(key, { at: now, payload });
  return { cached: false, payload };
}

export function optimisticPageChunk({ page, totalPages, pageText } = {}) {
  return { page: Math.max(1, Number(page)||1), totalPages: Math.max(1, Number(totalPages)||1), pageText: String(pageText||"").trim(), optimistic: true, at: Date.now() };
}

export default { debounceLivePaper, optimisticPageChunk };
