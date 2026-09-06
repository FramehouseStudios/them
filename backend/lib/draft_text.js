// Draft text primitives shared by the talk orchestrator and the screenplay routes.
// Moved verbatim out of index.js (D009).

function splitScreenplayLines(draft) {
  const normalized = String(draft || "").replace(/\r\n/g, "\n");
  if (!normalized) return [];
  return normalized.split("\n");
}

function buildDraftExcerpt(draft, maxChars = 220) {
  return String(draft || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(32, maxChars));
}

export { splitScreenplayLines, buildDraftExcerpt };
