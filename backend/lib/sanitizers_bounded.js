// D009 — sanitize* helpers that read module limits, extracted verbatim from backend/index.js.
//
// Functions here read only their arguments, the helpers imported below, the
// limits in lib/limits.js, and each other. Moved verbatim with doc comments;
// index.js imports every name unchanged.

import { normalizeDialogueSegmentKind, normalizeRememberedRelation, normalizeTalkMultilineSnippet, normalizeTaskPriority } from "./normalizers.js";
import { normalizeUserPersonName } from "./normalizers_bounded.js";
import { sanitizeTalkPageAnchor, sanitizeTalkRevealUnits } from "./sanitizers.js";
import { clampUnit, normalizeSnippet } from "./utils.js";
import { randomUUID } from "node:crypto";
import { ADAPTIVE_BIAS_LIMIT, ADAPTIVE_HISTORY_MAX, ADAPTIVE_QUALITY_TAGS, SOCIAL_SPARK_MEMORY_MAX, TASKS_MAX_STORED, USER_MEMORY_REMEMBERED_PEOPLE_MAX } from "./limits.js";

function sanitizeTalkDialogueTimeline(dialogueTimeline = null) {
  if (!dialogueTimeline || typeof dialogueTimeline !== "object") return null;
  const revisionId = normalizeSnippet(
    dialogueTimeline.revision_id ?? dialogueTimeline.revisionId,
    96
  ) || randomUUID();
  return {
    turn_id: normalizeSnippet(dialogueTimeline.turn_id ?? dialogueTimeline.turnId, 96),
    revision_id: revisionId,
    audio_asset_id: normalizeSnippet(dialogueTimeline.audio_asset_id ?? dialogueTimeline.audioAssetId, 120),
    duration_ms: Math.max(0, Number(dialogueTimeline.duration_ms ?? dialogueTimeline.durationMs ?? 0)),
    document_revision_id: normalizeSnippet(
      dialogueTimeline.document_revision_id ?? dialogueTimeline.documentRevisionId,
      96
    ) || revisionId,
    insertion_anchor: sanitizeTalkPageAnchor(
      dialogueTimeline.insertion_anchor ?? dialogueTimeline.insertionAnchor,
      { script_node_id: `${revisionId}:root`, range_start: 0, range_end: 0 }
    ),
    segments: Array.isArray(dialogueTimeline.segments)
      ? dialogueTimeline.segments
        .filter((segment) => segment && typeof segment === "object")
        .slice(0, 400)
        .map((segment, index) => {
          const id = normalizeSnippet(segment.id, 160) || `${revisionId}:segment:${index + 1}`;
          return {
            id,
            line_id: normalizeSnippet(segment.line_id ?? segment.lineId, 160) || `${revisionId}:line:${index + 1}`,
            kind: normalizeDialogueSegmentKind(segment.kind),
            text: normalizeTalkMultilineSnippet(segment.text, 240),
            start_ms: Math.max(0, Number(segment.start_ms ?? segment.startMs ?? 0)),
            end_ms: Math.max(
              Math.max(0, Number(segment.start_ms ?? segment.startMs ?? 0)) + 1,
              Number(segment.end_ms ?? segment.endMs ?? 0)
            ),
            page_anchor: sanitizeTalkPageAnchor(
              segment.page_anchor ?? segment.pageAnchor,
              { script_node_id: `${revisionId}:node:${index + 1}` }
            ),
            reveal_units: sanitizeTalkRevealUnits(
              segment.reveal_units ?? segment.revealUnits,
              id
            ),
          };
        })
      : [],
  };
}

function sanitizeTaskItems(items, maxItems = TASKS_MAX_STORED) {
  const source = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "").trim() || `task-${randomUUID().slice(0, 8)}`;
    const title = normalizeSnippet(item.title, 160);
    if (!title) continue;
    const statusRaw = String(item.status || "open").trim().toLowerCase();
    const status = statusRaw === "done" || statusRaw === "completed" ? "completed" : "open";
    const priority = normalizeTaskPriority(item.priority);
    const dueAt = Math.max(0, Number(item.dueAt || 0));
    const createdAt = Math.max(0, Number(item.createdAt || 0));
    const completedAt = Math.max(0, Number(item.completedAt || 0));
    const sourceTag = normalizeSnippet(item.source, 40) || "conversation";
    out.push({
      id,
      title,
      status,
      priority,
      dueAt,
      createdAt,
      completedAt,
      source: sourceTag,
    });
  }
  return out.slice(-Math.max(1, maxItems));
}

function sanitizeRememberedPeople(items, maxItems = USER_MEMORY_REMEMBERED_PEOPLE_MAX) {
  const source = Array.isArray(items) ? items : [];
  const deduped = new Map();
  for (const item of source) {
    const raw = item && typeof item === "object" ? item : { name: item };
    const name = normalizeUserPersonName(raw.name);
    if (!name) continue;
    const relation = normalizeRememberedRelation(raw.relation || raw.role || raw.label);
    const note = normalizeSnippet(raw.note, 90);
    const updatedAt = Math.max(0, Number(raw.updatedAt || raw.ts || Date.now()));
    const key = name.toLowerCase();
    const prev = deduped.get(key);
    if (!prev || updatedAt >= Number(prev.updatedAt || 0)) {
      deduped.set(key, { name, relation, note, updatedAt });
    }
  }
  return [...deduped.values()]
    .sort((a, b) => Number(a.updatedAt || 0) - Number(b.updatedAt || 0))
    .slice(-Math.max(1, maxItems));
}

function sanitizeAdaptiveBias(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(-ADAPTIVE_BIAS_LIMIT, Math.min(ADAPTIVE_BIAS_LIMIT, raw));
}

function sanitizeAdaptiveQualityTags(items, maxItems = 8) {
  const source = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of source) {
    const tag = String(item || "").trim().toLowerCase();
    if (!tag || !ADAPTIVE_QUALITY_TAGS.has(tag)) continue;
    if (!out.includes(tag)) out.push(tag);
  }
  return out.slice(0, Math.max(1, maxItems));
}

function sanitizeAdaptiveHistoryItems(items, maxItems = ADAPTIVE_HISTORY_MAX) {
  const source = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const ts = Math.max(0, Number(item.ts || 0));
    const score = clampUnit(item.score, 0.66);
    const sourceTag = normalizeSnippet(item.source, 24) || "heuristic";
    const tags = sanitizeAdaptiveQualityTags(item.tags, 8);
    out.push({ ts, score, source: sourceTag, tags });
  }
  return out.slice(-Math.max(1, maxItems));
}

function sanitizeSocialSparkMoments(items, maxItems = SOCIAL_SPARK_MEMORY_MAX) {
  const source = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const event = normalizeSnippet(item.event, 96);
    const detail = normalizeSnippet(item.detail, 140);
    const affect = normalizeSnippet(item.affect, 40);
    if (!event && !detail) continue;
    out.push({
      event: event || "met someone",
      detail: detail || "",
      affect: affect || "",
      turn: Math.max(0, Number(item.turn || 0)),
      ts: Math.max(0, Number(item.ts || 0)),
    });
  }
  return out.slice(-Math.max(1, maxItems));
}

export {
  sanitizeAdaptiveBias,
  sanitizeAdaptiveHistoryItems,
  sanitizeAdaptiveQualityTags,
  sanitizeRememberedPeople,
  sanitizeSocialSparkMoments,
  sanitizeTalkDialogueTimeline,
  sanitizeTaskItems,
};
