// D009 — pure sanitize* helpers extracted verbatim from backend/index.js.
//
// Every function here reads only its arguments (plus the helpers imported
// below): no module state, no calls back into index.js. Moved verbatim with
// its doc comment; index.js imports it by the same name, so no call site
// changed.

import { normalizeMemoryCardId, normalizeTalkMultilineSnippet, normalizeTalkScreenplayInsertionMode } from "./normalizers.js";
import { normalizeSnippet } from "./utils.js";

function sanitizeTalkPageAnchor(anchor = {}, fallback = {}) {
  const anchorLine = Math.max(
    0,
    Number(anchor.anchor_line ?? anchor.anchorLine ?? fallback.anchor_line ?? fallback.anchorLine ?? 0)
  );
  const anchorEndLineRaw = Number(
    anchor.anchor_end_line ?? anchor.anchorEndLine ?? fallback.anchor_end_line ?? fallback.anchorEndLine ?? 0
  );
  const anchorEndLine = anchorEndLineRaw > 0
    ? Math.max(anchorLine || 1, anchorEndLineRaw)
    : 0;
  const insertMode = normalizeTalkScreenplayInsertionMode(
    anchor.insert_mode ?? anchor.insertMode ?? fallback.insert_mode ?? fallback.insertMode,
    { anchorLine, anchorEndLine }
  );
  return {
    project_id: normalizeSnippet(anchor.project_id ?? anchor.projectId ?? fallback.project_id ?? fallback.projectId, 96),
    scene_id: normalizeSnippet(anchor.scene_id ?? anchor.sceneId ?? fallback.scene_id ?? fallback.sceneId, 120),
    beat_id: normalizeSnippet(anchor.beat_id ?? anchor.beatId ?? fallback.beat_id ?? fallback.beatId, 120) || null,
    script_node_id: normalizeSnippet(anchor.script_node_id ?? anchor.scriptNodeId ?? fallback.script_node_id ?? fallback.scriptNodeId, 160),
    page_index: Number.isFinite(Number(anchor.page_index ?? anchor.pageIndex ?? fallback.page_index ?? fallback.pageIndex))
      ? Math.max(0, Number(anchor.page_index ?? anchor.pageIndex ?? fallback.page_index ?? fallback.pageIndex))
      : null,
    range_start: Math.max(0, Number(anchor.range_start ?? anchor.rangeStart ?? fallback.range_start ?? fallback.rangeStart ?? 0)),
    range_end: Math.max(
      Math.max(0, Number(anchor.range_start ?? anchor.rangeStart ?? fallback.range_start ?? fallback.rangeStart ?? 0)),
      Number(anchor.range_end ?? anchor.rangeEnd ?? fallback.range_end ?? fallback.rangeEnd ?? 0)
    ),
    anchor_line: anchorLine > 0 ? anchorLine : null,
    anchor_end_line: anchorEndLine > 0 ? anchorEndLine : null,
    insert_mode: insertMode,
  };
}

function sanitizeTalkRevealUnits(units = [], segmentId = "") {
  if (!Array.isArray(units)) return [];
  return units
    .filter((unit) => unit && typeof unit === "object")
    .slice(0, 80)
    .map((unit, index) => ({
      id: normalizeSnippet(unit.id, 160) || `${segmentId}:unit:${index}`,
      text: normalizeTalkMultilineSnippet(unit.text, 160),
      start_ms: Math.max(0, Number(unit.start_ms ?? unit.startMs ?? 0)),
      end_ms: Math.max(
        Math.max(0, Number(unit.start_ms ?? unit.startMs ?? 0)) + 1,
        Number(unit.end_ms ?? unit.endMs ?? 0)
      ),
      utf16_start: Math.max(0, Number(unit.utf16_start ?? unit.utf16Start ?? 0)),
      utf16_end: Math.max(
        Math.max(0, Number(unit.utf16_start ?? unit.utf16Start ?? 0)),
        Number(unit.utf16_end ?? unit.utf16End ?? 0)
      ),
    }));
}

function sanitizeTimestampList(items, maxItems = 512) {
  const source = Array.isArray(items) ? items : [];
  return source
    .map((x) => Number(x || 0))
    .filter((x) => Number.isFinite(x) && x > 0)
    .slice(-Math.max(1, maxItems));
}

function sanitizeDayStampList(items, maxItems = 56) {
  const source = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of source) {
    const stamp = String(item || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) continue;
    if (!out.includes(stamp)) out.push(stamp);
  }
  return out.slice(-Math.max(1, maxItems));
}

function sanitizeDailyTurnItems(items, maxItems = 56) {
  const source = Array.isArray(items) ? items : [];
  return source
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      day: String(item.day || "").trim(),
      count: Math.max(0, Number(item.count || 0)),
    }))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.day))
    .slice(-Math.max(1, maxItems));
}

function sanitizeMemoryCardIdList(items, maxItems = 512) {
  const source = Array.isArray(items) ? items : (items ? [items] : []);
  const out = [];
  for (const item of source) {
    const id = normalizeMemoryCardId(item);
    if (!id) continue;
    if (!out.includes(id)) out.push(id);
  }
  if (out.length > maxItems) {
    return out.slice(out.length - maxItems);
  }
  return out;
}

function sanitizeEmbeddingVector(vec) {
  if (!Array.isArray(vec) || !vec.length) return null;
  const out = [];
  for (const value of vec) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out.length ? out : null;
}

export {
  sanitizeDailyTurnItems,
  sanitizeDayStampList,
  sanitizeEmbeddingVector,
  sanitizeMemoryCardIdList,
  sanitizeTalkPageAnchor,
  sanitizeTalkRevealUnits,
  sanitizeTimestampList,
};
