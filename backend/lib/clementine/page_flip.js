// Page-flip pagination — split Fountain draft into flippable pages.
// Pure helper, D009 strangler, no backend/index.js growth.

function paginateFountainDraft(draft, { linesPerPage = 55 } = {}) {
  if (!draft) return [];
  const text = String(draft);
  // Split by INT./EXT. headers — each header starts a new page when near page boundary,
  // fallback to line-count pagination for plain Fountain offline draft.
  const headers = [...text.matchAll(/^(INT\.|EXT\.)[^\n]*$/gm)];
  if (headers.length >= 2) {
    // Header-based: one page per INT./EXT. — enables flip-through for 5→6 pages
    const pages = [];
    for (let i = 0; i < headers.length; i++) {
      const start = headers[i].index;
      const end = headers[i+1] ? headers[i+1].index : text.length;
      pages.push(text.slice(start, end).trim());
    }
    return pages.filter(Boolean);
  }
  // Line-count fallback
  const lines = text.split("\n");
  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage).join("\n").trim());
  }
  return pages.filter(Boolean);
}

function buildPageFlipPayload({ project, draft, currentPage = 1 } = {}) {
  const pages = paginateFountainDraft(draft);
  const totalPages = Math.max(1, pages.length);
  const cur = Math.max(1, Math.min(totalPages, Number(currentPage) || 1));
  return {
    totalPages,
    currentPage: cur,
    pageText: pages[cur - 1] || "",
    pages, // full array for flip-through
    hasNext: cur < totalPages,
    hasPrev: cur > 1,
    projectId: String(project?.id || ""),
    logline: String(project?.logline || "").slice(0, 280),
  };
}

export { paginateFountainDraft, buildPageFlipPayload };
