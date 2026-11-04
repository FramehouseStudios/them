// Compatibility view of the canonical printed-page engine. Display pages are
// never a source document: wrapping / MORE / CONT'D must not be saved as text.
import { paginateScreenplay } from "../screenplay_pagination.js";

function paginateFountainDraft(draft, options = {}) {
  return paginateScreenplay(draft, options).pages.map(page => page.lines.join("\n"));
}

function buildPageFlipPayload({ project, draft, currentPage = 1 } = {}) {
  const pages = paginateFountainDraft(draft);
  const totalPages = pages.length;
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
