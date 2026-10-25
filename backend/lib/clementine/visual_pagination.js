// Compatibility exports; the canonical engine owns all preview pagination.
import { paginateFountainDraft, buildPageFlipPayload } from "./page_flip.js";
import { LINES_PER_PAGE } from "../screenplay_pagination.js";
import { exportToFDX } from "../fdx_export.js";
import { exportToFountain } from "../fountain_export.js";
import { importFromFountain } from "../fountain_import.js";

export { LINES_PER_PAGE };
export const ELEMENT_KINDS = Object.freeze(["heading", "action", "character", "dialogue", "parenthetical", "transition", "centered", "lyrics", "section", "synopsis", "blank"]);

export function paginateVisualDraft(draft, options = {}) {
  const source = typeof draft === "string" ? draft : draft && typeof draft === "object" && Array.isArray(draft.scenes) ? exportToFountain(draft) : "";
  return paginateFountainDraft(source, options);
}

export function buildVisualPaperPayload({ project, draft, currentPage = 1 } = {}) {
  const source = draft ?? project?.versions?.[0]?.draft ?? project?.latestDraft ?? "";
  return { ...buildPageFlipPayload({ project, draft: source, currentPage }), linesPerPage: LINES_PER_PAGE };
}

// FDX exports the original semantic source, never display wrapping/MORE/cues.
// The old `paginated` option remains accepted but cannot alter writer words.
export function exportVisualFDX(screenplayOrDraft, _options = {}) {
  return exportToFDX(typeof screenplayOrDraft === "string" ? importFromFountain(screenplayOrDraft) : screenplayOrDraft);
}

export const paginateFountainVisual = paginateVisualDraft;
export default { LINES_PER_PAGE, ELEMENT_KINDS, paginateVisualDraft, paginateFountainVisual, buildVisualPaperPayload, exportVisualFDX };
