// D009 — normalize* helpers that read module limits, extracted verbatim from backend/index.js.
//
// Functions here read only their arguments, the helpers imported below, the
// limits in lib/limits.js, and each other. Moved verbatim with doc comments;
// index.js imports every name unchanged.

import { buildDraftExcerpt, buildKnowledgeSearchText } from "./builders.js";
import { normalizeKnowledgeTags, normalizeKnowledgeTopic, normalizeScreenplayCompanionTimestamp, normalizeScreenplayMultilineSnippet, normalizeScreenplayStringList, normalizeStoredScreenplayDiffAcknowledgedKey, normalizeStoredScreenplayWriteAnchor, normalizeStoryObligationChangeForApi } from "./normalizers.js";
import { normalizeSnippet } from "./utils.js";
import { ASSISTANT_SELF_NAME_MAX_CHARS, KNOWLEDGE_RAG_CARD_BODY_MAX_CHARS, SCREENPLAY_MEMORY_GENERIC_CUES, USER_PRIMARY_NAME_MAX_CHARS, VISUAL_CONTEXT_IMAGE_DATA_URL_MAX_CHARS } from "./limits.js";

function normalizeAssistantSelfName(value) {
  const cleaned = String(value || "")
    .replace(/^[`"'“”‘’\s]+|[`"'“”‘’\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9' -]/g, "")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length < 2) return "";
  const bounded = cleaned.slice(0, ASSISTANT_SELF_NAME_MAX_CHARS).trim();
  if (!bounded) return "";
  const lower = bounded.toLowerCase();
  if (["you", "yourself", "me", "myself", "assistant", "ai", "bot"].includes(lower)) {
    return "";
  }
  const hasUpper = /[A-Z]/.test(bounded);
  if (hasUpper) return bounded;
  return bounded
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function normalizeUserPersonName(value, maxChars = USER_PRIMARY_NAME_MAX_CHARS) {
  const cleaned = String(value || "")
    .replace(/^[`"'“”‘’\s]+|[`"'“”‘’\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9' -]/g, "")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length < 2) return "";
  const bounded = cleaned.slice(0, maxChars).trim();
  if (!bounded) return "";
  const lower = bounded.toLowerCase();
  if (
    [
      "me", "myself", "you", "yourself", "name", "remember", "something", "someone",
      "later", "tomorrow", "today", "tonight", "friend", "person", "unknown",
      "this", "that", "it", "him", "her",
    ].includes(lower)
  ) {
    return "";
  }
  return bounded
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function normalizeStoredScreenplayVersion(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = normalizeSnippet(entry.id, 64);
  if (!id) return null;
  return {
    id,
    projectId: normalizeSnippet(entry.projectId, 64),
    phase: normalizeSnippet(entry.phase, 48) || "scene_draft",
    source: normalizeSnippet(entry.source, 48),
    clientRequestId: normalizeSnippet(entry.clientRequestId ?? entry.client_request_id, 96),
    createdAt: Math.max(0, Number(entry.createdAt || 0)),
    updatedAt: Math.max(0, Number(entry.updatedAt || entry.createdAt || 0)),
    prompt: normalizeSnippet(entry.prompt, 320),
    notes: normalizeSnippet(entry.notes, 240),
    formatScore: Number(entry.formatScore || 0),
    storyScore: Number(entry.storyScore || 0),
    confidenceClass: normalizeSnippet(entry.confidenceClass, 24) || "medium",
    warnings: normalizeScreenplayStringList(entry.warnings, 8, 64),
    draft: String(entry.draft || ""),
    draftExcerpt: buildDraftExcerpt(entry.draftExcerpt || entry.draft || ""),
    studioWriteAnchors: normalizeStoredScreenplayWriteAnchors(entry.studioWriteAnchors || entry.studio_write_anchors),
    screenplayBindings: normalizeStoredScreenplayBindings(entry.screenplayBindings || entry.screenplay_bindings),
  };
}

function normalizeStoredScreenplayWriteAnchors(list) {
  if (!Array.isArray(list)) return [];
  const deduped = new Map();
  for (const item of list) {
    const normalized = normalizeStoredScreenplayWriteAnchor(item);
    if (!normalized) continue;
    deduped.set(normalized.writeId, normalized);
  }
  return [...deduped.values()].slice(0, 48);
}

function normalizeStoredScreenplayBinding(entry) {
  if (!entry || typeof entry !== "object") return null;
  const draftSceneId = normalizeSnippet(entry.draftSceneId ?? entry.draft_scene_id, 96);
  if (!draftSceneId) return null;
  return {
    draftSceneId,
    draftLine: Math.max(0, Number((entry.draftLine ?? entry.draft_line) || 0)),
    draftEndLine: Math.max(0, Number((entry.draftEndLine ?? entry.draft_end_line) || 0)),
    draftSlugline: normalizeSnippet(entry.draftSlugline ?? entry.draft_slugline, 180),
    draftShortLabel: normalizeSnippet(entry.draftShortLabel ?? entry.draft_short_label, 140),
    outlineSceneId: normalizeSnippet(entry.outlineSceneId ?? entry.outline_scene_id, 96),
    outlineSceneTitle: normalizeSnippet(entry.outlineSceneTitle ?? entry.outline_scene_title, 180),
    outlineSceneSlugline: normalizeSnippet(entry.outlineSceneSlugline ?? entry.outline_scene_slugline, 180),
    outlineBeatIds: normalizeScreenplayStringList(entry.outlineBeatIds ?? entry.outline_beat_ids, 64, 96),
    outlineBeatLabels: normalizeScreenplayStringList(entry.outlineBeatLabels ?? entry.outline_beat_labels, 64, 180),
    actTitle: normalizeSnippet(entry.actTitle ?? entry.act_title, 140),
    matchedBy: normalizeSnippet(entry.matchedBy ?? entry.matched_by, 48),
    updatedAt: Math.max(0, Number((entry.updatedAt ?? entry.updated_at) || 0)),
  };
}

function normalizeStoredCreativeProactiveSuggestion(entry) {
  if (!entry || typeof entry !== "object") return null;
  const prompt = normalizeSnippet(entry.prompt, 220);
  if (!prompt) return null;
  return {
    category: normalizeSnippet(entry.category, 32) || "Story",
    prompt,
    reason: normalizeSnippet(entry.reason, 240),
    updatedAt: normalizeScreenplayCompanionTimestamp(entry.updatedAt ?? entry.updated_at),
  };
}

function normalizeStoredScreenplayBindings(list) {
  if (!Array.isArray(list)) return [];
  const deduped = new Map();
  for (const item of list) {
    const normalized = normalizeStoredScreenplayBinding(item);
    if (!normalized) continue;
    deduped.set(normalized.draftSceneId, normalized);
  }
  return [...deduped.values()].slice(0, 128);
}

function normalizeStoredScreenplayDiffAcknowledgedKeys(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(
    list
      .map((item) => normalizeStoredScreenplayDiffAcknowledgedKey(item))
      .filter(Boolean)
  )].slice(0, 48);
}

function normalizeStoredScreenplayDiffAcknowledgedEntries(list) {
  if (!Array.isArray(list)) return [];
  const entries = [];
  const seen = new Set();
  for (const item of list) {
    const raw = item && typeof item === "object" ? item : {};
    const key = normalizeStoredScreenplayDiffAcknowledgedKey(raw.key ?? raw.persistentKey ?? item);
    if (!key || seen.has(key)) continue;
    const fingerprint = normalizeSnippet(raw.fingerprint ?? raw.currentFingerprint ?? raw.current_fingerprint, 320);
    const writeId = normalizeSnippet(raw.writeId ?? raw.write_id ?? raw.acknowledgedWriteId ?? raw.acknowledged_write_id, 72);
    entries.push({
      key,
      fingerprint: fingerprint || "",
      writeId: writeId || "",
    });
    seen.add(key);
  }
  return entries.slice(0, 48);
}

function normalizeStoredScreenplayDiffAcknowledgementState(entry) {
  const raw = entry && typeof entry === "object" ? entry : {};
  const normalizedEntries = normalizeStoredScreenplayDiffAcknowledgedEntries(
    raw.entries
    || raw.Entries
    || raw.studioDiffAcknowledgedEntries
    || raw.studio_diff_acknowledged_entries
  );
  const normalizedKeys = normalizeStoredScreenplayDiffAcknowledgedKeys(
    raw.keys
    || raw.Keys
    || raw.studioDiffAcknowledgedKeys
    || raw.studio_diff_acknowledged_keys
  );
  const mergedEntries = [...normalizedEntries];
  const seen = new Set(mergedEntries.map((item) => item.key));
  for (const key of normalizedKeys) {
    if (seen.has(key)) continue;
    mergedEntries.push({ key, fingerprint: "", writeId: "" });
    seen.add(key);
  }
  const keys = mergedEntries.map((item) => item.key).slice(0, 48);
  return {
    keys,
    entries: mergedEntries.slice(0, 48),
  };
}

function normalizeStoredScreenplayStudioAskNoteExchange(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = normalizeSnippet(entry.id, 96);
  const prompt = normalizeSnippet(entry.prompt, 1200);
  const noteBody = normalizeScreenplayMultilineSnippet(entry.noteBody ?? entry.note_body, 2400);
  const insertedText = normalizeScreenplayMultilineSnippet(entry.insertedText ?? entry.inserted_text, 2400);
  const developmentText = normalizeScreenplayMultilineSnippet(entry.developmentText ?? entry.development_text, 2400);
  if (!id || (!prompt && !noteBody && !insertedText && !developmentText)) return null;
  const target = normalizeSnippet(entry.target, 32) || "voicePin";
  const source = normalizeSnippet(entry.source, 32) || "typed";
  return {
    id,
    backendThreadID: normalizeSnippet(entry.backendThreadID ?? entry.backendThreadId ?? entry.backend_thread_id, 120),
    backendTurn: Number.isFinite(Number(entry.backendTurn ?? entry.backend_turn))
      ? Math.max(0, Math.floor(Number(entry.backendTurn ?? entry.backend_turn)))
      : null,
    requestID: normalizeSnippet(entry.requestID ?? entry.requestId ?? entry.request_id, 120),
    prompt,
    target: ["page", "voicePin"].includes(target) ? target : "voicePin",
    source: ["typed", "voice"].includes(source) ? source : "typed",
    noteTitle: normalizeSnippet(entry.noteTitle ?? entry.note_title, 240) || "Clementine",
    noteBody,
    developmentText,
    writeID: normalizeSnippet(entry.writeID ?? entry.writeId ?? entry.write_id, 96),
    replacedWriteID: normalizeSnippet(entry.replacedWriteID ?? entry.replacedWriteId ?? entry.replaced_write_id, 96),
    anchorLine: Number.isFinite(Number(entry.anchorLine ?? entry.anchor_line))
      ? Math.max(1, Math.floor(Number(entry.anchorLine ?? entry.anchor_line)))
      : null,
    anchorEndLine: Number.isFinite(Number(entry.anchorEndLine ?? entry.anchor_end_line))
      ? Math.max(1, Math.floor(Number(entry.anchorEndLine ?? entry.anchor_end_line)))
      : null,
    anchorSceneLabel: normalizeSnippet(entry.anchorSceneLabel ?? entry.anchor_scene_label, 180),
    anchorExcerpt: normalizeScreenplayMultilineSnippet(entry.anchorExcerpt ?? entry.anchor_excerpt, 1600),
    insertedText,
    replacementApplied: typeof (entry.replacementApplied ?? entry.replacement_applied) === "boolean"
      ? Boolean(entry.replacementApplied ?? entry.replacement_applied)
      : null,
    revisedBlockText: normalizeScreenplayMultilineSnippet(entry.revisedBlockText ?? entry.revised_block_text, 2400),
    resolvedAnchorExcerpt: normalizeScreenplayMultilineSnippet(entry.resolvedAnchorExcerpt ?? entry.resolved_anchor_excerpt, 1600),
    packLabel: normalizeSnippet(entry.packLabel ?? entry.pack_label, 120),
    phase: normalizeSnippet(entry.phase, 80),
    sluglineAnchorLine: Number.isFinite(Number(entry.sluglineAnchorLine ?? entry.slugline_anchor_line))
      ? Math.max(1, Math.floor(Number(entry.sluglineAnchorLine ?? entry.slugline_anchor_line)))
      : null,
    memoryDomainRaw: normalizeSnippet(entry.memoryDomainRaw ?? entry.memory_domain_raw, 80),
    companionModeRaw: normalizeSnippet(entry.companionModeRaw ?? entry.companion_mode_raw, 80),
    timestamp: normalizeSnippet(entry.timestamp, 80) || new Date().toISOString(),
  };
}

function normalizeStoredScreenplayStudioAskNoteHistory(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const normalized = [];
  for (const item of list) {
    const exchange = normalizeStoredScreenplayStudioAskNoteExchange(item);
    if (!exchange || seen.has(exchange.id)) continue;
    seen.add(exchange.id);
    normalized.push(exchange);
    if (normalized.length >= 24) break;
  }
  return normalized;
}

function normalizeScreenplayMemoryCharacterCue(line = "") {
  const cue = normalizeSnippet(
    String(line || "")
      .replace(/\s+\([^()\n]{1,40}\)\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim(),
    80
  );
  if (!cue || cue.length > 42 || cue !== cue.toUpperCase() || !/[A-Z]/.test(cue)) return "";
  if (SCREENPLAY_MEMORY_GENERIC_CUES.has(cue)) return "";
  if (/^(?:FADE IN|FADE OUT|CUT TO|SMASH CUT|DISSOLVE TO|THE END|END)$/.test(cue)) return "";
  return cue
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
    .replace(/\bTv\b/g, "TV")
    .replace(/\bFbi\b/g, "FBI")
    .replace(/\bCia\b/g, "CIA");
}

function normalizeVisualContextImageDataUrl(value) {
  if (!value) return "";
  const clipped = String(value).trim().slice(0, VISUAL_CONTEXT_IMAGE_DATA_URL_MAX_CHARS);
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(clipped)) {
    return "";
  }
  return clipped.replace(/^data:image\/jpg;/i, "data:image/jpeg;");
}

function normalizeKnowledgeCard(card, idx = 0) {
  if (!card || typeof card !== "object") return null;
  const topic = normalizeKnowledgeTopic(card.topic);
  const title = normalizeSnippet(card.title, 140);
  const body = normalizeSnippet(card.body, KNOWLEDGE_RAG_CARD_BODY_MAX_CHARS);
  if (!title || !body) return null;
  const tags = normalizeKnowledgeTags(card.tags);
  const source = normalizeSnippet(card.source, 32).toLowerCase() || "knowledge";
  const level = normalizeSnippet(card.level, 24).toLowerCase() || "foundation";
  const normalized = {
    id: normalizeSnippet(card.id, 64) || `k_${idx + 1}`,
    topic: topic || "general",
    title,
    body,
    tags,
    level,
    source,
  };
  normalized.searchText = buildKnowledgeSearchText(normalized);
  return normalized;
}

function normalizeStoryObligationLedgerForApi(value = []) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const normalized = normalizeStoryObligationChangeForApi(item);
    const key = normalizeSnippet(normalized?.obligation, 220).toLowerCase();
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= 12) break;
  }
  return out;
}

export {
  normalizeAssistantSelfName,
  normalizeKnowledgeCard,
  normalizeScreenplayMemoryCharacterCue,
  normalizeStoredCreativeProactiveSuggestion,
  normalizeStoredScreenplayBinding,
  normalizeStoredScreenplayBindings,
  normalizeStoredScreenplayDiffAcknowledgedEntries,
  normalizeStoredScreenplayDiffAcknowledgedKeys,
  normalizeStoredScreenplayDiffAcknowledgementState,
  normalizeStoredScreenplayStudioAskNoteExchange,
  normalizeStoredScreenplayStudioAskNoteHistory,
  normalizeStoredScreenplayVersion,
  normalizeStoredScreenplayWriteAnchors,
  normalizeStoryObligationLedgerForApi,
  normalizeUserPersonName,
  normalizeVisualContextImageDataUrl,
};
