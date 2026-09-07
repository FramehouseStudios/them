// talk_clementine_headers — D009 strangler: x-suggestion / x-uncertainty / x-collab-cursor for talk_handler.
// No backend/index.js growth. Pure helpers, tested via talk_handler + unit test.
// Wire: talk_handler calls applyClementineTalkHeaders(res, { project, draft, parsed, quality, collabCursor }).
import { shouldSuggest, buildSuggestion } from "./samantha_intuition.js";

function toTrimmed(v) { return String(v||"").trim(); }

export function buildSuggestionHeader({ project, draft, parsed } = {}) {
  try {
    if (!shouldSuggest({ project, draft })) return "";
    const s = buildSuggestion({ project, parsed, draft });
    return toTrimmed(s?.xSuggestion || s?.suggestions?.[0] || "");
  } catch { return ""; }
}

export function buildUncertaintyHeader({ quality } = {}) {
  const conf = toTrimmed(quality?.confidence).toLowerCase();
  if (conf === "high") return "0.10";
  if (conf === "medium") return "0.40";
  if (conf === "low") return "0.80";
  // fallback from quality.ok
  if (quality && typeof quality.ok === "boolean") return quality.ok ? "0.20" : "0.70";
  return "0.50";
}

export function buildCollabCursorHeader({ collabCursor, project, draft } = {}) {
  // Prefer explicit cursor from request/body, else derive next page cursor.
  if (collabCursor && typeof collabCursor === "object") {
    const page = Math.max(1, Math.round(Number(collabCursor.page||collabCursor.p||1)));
    const line = Math.max(1, Math.round(Number(collabCursor.line||collabCursor.l||1)));
    const ch = toTrimmed(collabCursor.character||collabCursor.c||"");
    const payload = ch ? { page, line, character: ch } : { page, line };
    try { return JSON.stringify(payload); } catch { return JSON.stringify({ page, line }); }
  }
  // Derive next page from draft pagination (55 lines/page heuristic)
  const lines = String(draft||"").split("\n").length;
  const nextPage = Math.max(1, Math.ceil(lines/55) || 1);
  // include active character if project has one
  const ch = toTrimmed(project?.characterContexts?.[0]?.name || "");
  const payload = ch ? { page: nextPage, line: 1, character: ch } : { page: nextPage, line: 1 };
  return JSON.stringify(payload);
}

export function applyClementineTalkHeaders(res, { project, draft, parsed, quality, collabCursor } = {}) {
  const suggestion = buildSuggestionHeader({ project, draft, parsed });
  if (suggestion) {
    // cap encoded length ~800 decoded, encodeURIComponent safe
    const enc = encodeURIComponent(suggestion.slice(0, 800));
    res.setHeader("x-suggestion", enc);
  }
  const uncertainty = buildUncertaintyHeader({ quality });
  res.setHeader("x-uncertainty", uncertainty);
  const cursorJson = buildCollabCursorHeader({ collabCursor, project, draft });
  if (cursorJson) {
    const enc = encodeURIComponent(cursorJson.slice(0, 500));
    res.setHeader("x-collab-cursor", enc);
  }
}

export default { buildSuggestionHeader, buildUncertaintyHeader, buildCollabCursorHeader, applyClementineTalkHeaders };
