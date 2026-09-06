// D009 — pure normalizers extracted verbatim from backend/index.js.
//
// Every function here reads only its arguments (plus the helpers imported
// below): no module state, no calls back into index.js. Moved verbatim with
// its doc comment; index.js imports it by the same name, so no call site
// changed.

import { normalizeSnippet } from "./utils.js";

function normalizePromptSeed(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeClientIp(value) {
  let ip = String(value || "")
    .trim()
    .toLowerCase();
  if (!ip) return "unknown";

  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed && bracketed[1]) {
    ip = bracketed[1].toLowerCase();
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.replace(/:\d+$/, "");
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") {
    return "loopback";
  }

  return ip;
}

function normalizeClientToken(value) {
  const token = String(value || "").trim();
  if (!token) return "";
  if (token.length < 16 || token.length > 256) return "";
  return token;
}

function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length < 6 || key.length > 160) return "";
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) return "";
  return key;
}

function normalizeSpeculativeKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length < 6 || key.length > 96) return "";
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) return "";
  return key;
}

function normalizeSpeculativePromptHash(value) {
  const hash = String(value || "").trim().toLowerCase();
  if (!hash) return "";
  if (hash.length < 8 || hash.length > 64) return "";
  if (!/^[a-z0-9]+$/.test(hash)) return "";
  return hash;
}

function normalizeSpeculativeTranscript(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("’", "'")
    .replace(/[^\p{L}\p{N}\s']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTalkMultilineSnippet(text = "", maxChars = 8_000) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .slice(0, Math.max(0, Number(maxChars || 0)))
    .trim();
}

function normalizeDialogueSegmentKind(element = "") {
  const normalized = String(element || "").trim().toLowerCase();
  if (normalized === "character") return "character";
  if (normalized === "dialogue") return "dialogue";
  if (normalized === "parenthetical") return "parenthetical";
  if (normalized === "pause") return "pause";
  return "action";
}

function normalizeDialogueIdPart(value = "", fallback = "unknown") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizeTalkScreenplayInsertionMode(raw = "", {
  anchorLine = 0,
  anchorEndLine = 0,
  replacementApplied = false,
  replacedWriteId = "",
  revisedBlockText = "",
} = {}) {
  const clean = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if ([
    "replace",
    "replacement",
    "replace_selection",
    "rewrite",
    "rewrite_selection",
    "selection",
  ].includes(clean)) {
    return "replace_selection";
  }
  if ([
    "insert_after",
    "insert_after_anchor",
    "continue",
    "continuation",
    "append_after_anchor",
    "append",
  ].includes(clean)) {
    return "insert_after_anchor";
  }

  const safeAnchorLine = Math.max(0, Number(anchorLine || 0));
  const safeAnchorEndLine = Math.max(0, Number(anchorEndLine || 0));
  if (
    replacementApplied ||
    String(replacedWriteId || "").trim() ||
    String(revisedBlockText || "").trim() ||
    (safeAnchorLine > 0 && safeAnchorEndLine > safeAnchorLine)
  ) {
    return "replace_selection";
  }
  return "insert_after_anchor";
}

function normalizeEmailAddress(value) {
  const raw = String(value || "")
    .trim()
    .replace(/[<>\(\)\[\],;:"']/g, "")
    .toLowerCase();
  if (!raw) return "";
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(raw) ? raw : "";
}

function normalizeTaskPriority(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "high" || raw === "urgent") return "high";
  if (raw === "low") return "low";
  return "normal";
}

function normalizeLocalActionType(value) {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || "none";
}

function normalizeRememberedRelation(value) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9' -]/g, "")
    .trim()
    .toLowerCase();
  if (!cleaned) return "";
  return cleaned.slice(0, 48);
}

function normalizeScreenplayOwnerValue(value, prefix = "owner") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  if (!normalized) return "";
  return `${prefix}:${normalized}`;
}

function normalizeScreenplayStringList(items, maxItems = 16, maxChars = 48) {
  const source = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of source) {
    const clean = normalizeSnippet(item, maxChars);
    if (!clean) continue;
    if (!out.includes(clean)) out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeScreenplayMultilineSnippet(value, maxChars = 2400) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, Math.max(0, Number(maxChars || 0)));
}

function normalizeStoredScreenplayWriteAnchor(entry) {
  if (!entry || typeof entry !== "object") return null;
  const writeId = normalizeSnippet(entry.writeId ?? entry.write_id, 72);
  if (!writeId) return null;
  const anchorLine = Math.max(0, Number((entry.anchorLine ?? entry.anchor_line) || 0));
  const anchorEndLine = Math.max(0, Number((entry.anchorEndLine ?? entry.anchor_end_line) || 0));
  return {
    writeId,
    anchorLine: anchorLine > 0 ? anchorLine : 0,
    anchorEndLine: anchorEndLine > 0 ? anchorEndLine : 0,
    anchorSceneLabel: normalizeSnippet(entry.anchorSceneLabel ?? entry.anchor_scene_label, 140),
    anchorExcerpt: normalizeSnippet(entry.anchorExcerpt ?? entry.anchor_excerpt, 320),
    insertedText: normalizeSnippet(entry.insertedText ?? entry.inserted_text, 6000),
    updatedAt: Math.max(0, Number((entry.updatedAt ?? entry.updated_at) || 0)),
  };
}

function normalizeScreenplayCompanionTimestamp(value) {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeStoredScreenplayThreadViewState(entry) {
  if (!entry || typeof entry !== "object") return null;
  const searchText = normalizeSnippet(entry.searchText ?? entry.search_text, 220);
  const selectedFilterRaw = normalizeSnippet(entry.selectedFilterRaw ?? entry.selected_filter_raw, 48);
  const selectedSceneKey = normalizeSnippet(entry.selectedSceneKey ?? entry.selected_scene_key, 180);
  const scrollTargetKey = normalizeSnippet(entry.scrollTargetKey ?? entry.scroll_target_key, 180);
  const focusedDiffKey = normalizeSnippet(entry.focusedDiffKey ?? entry.focused_diff_key, 180);
  const latestReopenedWriteID = normalizeSnippet(
    entry.latestReopenedWriteID ?? entry.latestReopenedWriteId ?? entry.latest_reopened_write_id,
    180
  );
  const reopenedLineageKeys = Array.isArray(entry.reopenedLineageKeys ?? entry.reopened_lineage_keys)
    ? [...new Set((entry.reopenedLineageKeys ?? entry.reopened_lineage_keys)
        .map((item) => normalizeSnippet(item, 180))
        .filter(Boolean)
        .map((item) => item.toLowerCase()))]
        .slice(0, 48)
    : [];
  const collapsedSectionKeys = Array.isArray(entry.collapsedSectionKeys ?? entry.collapsed_section_keys)
    ? [...new Set((entry.collapsedSectionKeys ?? entry.collapsed_section_keys)
        .map((item) => normalizeSnippet(item, 180))
        .filter(Boolean))]
        .slice(0, 48)
    : [];
  if (!searchText && !selectedFilterRaw && !selectedSceneKey && !scrollTargetKey && !focusedDiffKey && !latestReopenedWriteID && collapsedSectionKeys.length === 0 && reopenedLineageKeys.length === 0) {
    return null;
  }
  return {
    searchText: searchText || "",
    selectedFilterRaw: selectedFilterRaw || "",
    selectedSceneKey: selectedSceneKey || "",
    scrollTargetKey: scrollTargetKey || "",
    collapsedSectionKeys,
    focusedDiffKey: focusedDiffKey || "",
    reopenedLineageKeys,
    latestReopenedWriteID: latestReopenedWriteID || "",
  };
}

function normalizeStoredScreenplayDiffAcknowledgedKey(value) {
  const normalized = normalizeSnippet(value, 180)?.toLowerCase() || "";
  if (!normalized) return "";
  if (normalized.startsWith("write:")) {
    const writeId = normalizeSnippet(normalized.slice("write:".length), 72)?.toLowerCase() || "";
    return writeId ? `lineage:${writeId}` : "";
  }
  return normalized;
}

function normalizeMemoryCardId(value) {
  const clean = String(value || "")
    .trim()
    .toLowerCase();
  if (!clean) return "";
  return clean.replace(/\s+/g, "");
}

function normalizeHistoryRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "assistant") return "assistant";
  return "user";
}

function normalizeThemeLabel(text, fallback) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^[`"'“”‘’\s]+|[`"'“”‘’\s]+$/g, "")
    .trim();
  if (!clean) return String(fallback || "Life Theme");
  const bounded = clean.slice(0, 56).trim();
  return bounded || String(fallback || "Life Theme");
}

function normalizeThemeTone(text, fallback) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^[`"'“”‘’\s]+|[`"'“”‘’\s]+$/g, "")
    .trim();
  if (!clean) return String(fallback || "mixed emotions");
  const bounded = clean.slice(0, 72).trim();
  return bounded || String(fallback || "mixed emotions");
}

function normalizeThemeSummary(text, fallback) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^[`"'“”‘’\s]+|[`"'“”‘’\s]+$/g, "")
    .trim();
  if (!clean) return String(fallback || "");
  const bounded = clean.slice(0, 180).trim();
  if (!bounded) return String(fallback || "");
  const firstSentence = (bounded.match(/[^.!?]+[.!?]?/) || [bounded])[0].trim();
  if (!firstSentence) return String(fallback || "");
  return /[.!?]$/.test(firstSentence) ? firstSentence : `${firstSentence}.`;
}

function normalizeThreadReferenceHintTemplate(text, fallbackLabel = "") {
  const fallback = String(fallbackLabel || "").trim()
    ? `you mentioned ${String(fallbackLabel).toLowerCase()}`
    : "you mentioned this thread before";
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^[`"'“”‘’\s]+|[`"'“”‘’\s]+$/g, "")
    .trim();
  if (!clean) return fallback;
  const bounded = clean.slice(0, 120).trim();
  return bounded || fallback;
}

function normalizeThemeReason(text, fallback = "") {
  const clean = normalizeSnippet(
    String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^[`"'“”‘’\s]+|[`"'“”‘’\s]+$/g, "")
      .trim(),
    200
  );
  if (clean) return clean;
  return normalizeSnippet(String(fallback || ""), 200);
}

function normalizeThemeSource(source) {
  const raw = String(source || "")
    .trim()
    .toLowerCase();
  if (!raw) return "carry";
  if ([
    "classifier",
    "fallback",
    "summarizer",
    "carry",
    "history_backfill",
    "promoted_history",
  ].includes(raw)) return raw;
  return "carry";
}

function normalizeMemoryQualitySignal(signal) {
  const raw = String(signal || "")
    .trim()
    .toLowerCase();
  if (raw === "hit" || raw === "confirm" || raw === "confirmed" || raw === "helpful") {
    return "hit";
  }
  if (raw === "correction" || raw === "correct" || raw === "fix" || raw === "incorrect") {
    return "correction";
  }
  return "none";
}

function normalizeFactKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeScreenplayMemoryInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function normalizeScreenplayActKey(value = "") {
  const text = normalizeSnippet(value, 120).toLowerCase();
  if (!text) return "";
  if (/\b(?:act\s*)?(?:iii|3|three)\b/.test(text) || /\bact3\b/.test(text)) return "act3";
  if (/\b(?:act\s*)?(?:ii|2|two)\b/.test(text) || /\bact2\b/.test(text)) return "act2";
  if (/\b(?:act\s*)?(?:i|1|one)\b/.test(text) || /\bact1\b/.test(text)) return "act1";
  return "";
}

function normalizeScreenplayActStatus(value = "") {
  const text = normalizeSnippet(value, 32).toLowerCase();
  if (["complete", "completed", "done", "closed"].includes(text)) return "complete";
  if (["active", "current", "in_progress", "in progress", "working"].includes(text)) return "active";
  if (["pending", "upcoming", "not_started", "not started"].includes(text)) return "pending";
  return "";
}

function normalizeScreenplayCorrectionTerm(value = "", maxChars = 120) {
  return normalizeSnippet(value, maxChars)
    .replace(/^(?:a|an|the|that|this)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeScreenplayMemoryMotif(value = "") {
  return normalizeSnippet(value, 140)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^(?:the|a|an)\s+/, "");
}

function normalizeRememberSnippet(text, maxChars = 96) {
  return normalizeSnippet(
    String(text || "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s+/g, " ")
      .trim(),
    maxChars
  );
}

function normalizeAuthenticatedUserId(value) {
  return String(value || "").trim();
}

function normalizeSpeechCompare(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVisualDescriptor(value, maxChars = 120) {
  return normalizeSnippet(value, maxChars);
}

function normalizeKnowledgeTopic(topic) {
  const raw = String(topic || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!raw) return "general";
  if (raw === "art" || raw === "arthistory" || raw === "art_hist") return "art_history";
  if (raw === "film" || raw === "films" || raw === "cinema") return "movies";
  if (raw === "compatability" || raw === "relationship_fit") return "compatibility";
  if (raw === "friends" || raw === "friend") return "friendship";
  if (raw === "human" || raw === "connection") return "human_connection";
  return raw;
}

function normalizeKnowledgeTags(raw, maxItems = 12) {
  const source = Array.isArray(raw)
    ? raw
    : (typeof raw === "string" ? raw.split(/[|,]/g) : []);
  const out = [];
  for (const item of source) {
    const tag = String(item || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_ -]+/g, "")
      .replace(/\s+/g, " ");
    if (!tag) continue;
    if (!out.includes(tag)) out.push(tag);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeWhitespace(s = "") {
  return String(s)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeCharacterBibleCardList(items = [], maxItems = 5, maxChars = 180) {
  if (!Array.isArray(items)) return [];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const clean = normalizeSnippet(item, maxChars);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeCharacterBibleCardArc(arc = null) {
  if (!arc || typeof arc !== "object" || Array.isArray(arc)) return {};
  const out = {};
  const fields = [
    ["act", arc.act ?? arc.currentAct ?? arc.current_act, 80],
    ["want", arc.want ?? arc.consciousWant ?? arc.conscious_want, 180],
    ["need", arc.need ?? arc.unconsciousNeed ?? arc.unconscious_need, 180],
    ["wound", arc.wound, 180],
    ["false_belief", arc.falseBelief ?? arc.false_belief, 180],
    ["relationship_pressure", arc.relationshipPressure ?? arc.relationship_pressure, 180],
    ["current_tactic", arc.currentTactic ?? arc.current_tactic, 180],
    ["next_emotional_turn", arc.nextEmotionalTurn ?? arc.next_emotional_turn, 180],
  ];
  for (const [key, value, maxChars] of fields) {
    const clean = normalizeSnippet(value, maxChars);
    if (clean) out[key] = clean;
  }
  return out;
}

function normalizeStoryObligationChangeForApi(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = normalizeSnippet(value.status, 32)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const kind = normalizeSnippet(value.kind, 48)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const obligation = normalizeSnippet(value.obligation, 220);
  const result = normalizeSnippet(value.result ?? value.fact, 240);
  const evidence = normalizeSnippet(value.evidence, 320);
  if (
    !obligation ||
    !result ||
    !evidence ||
    !["advanced", "complicated", "transformed", "paid_off"].includes(status)
  ) return null;
  return Object.fromEntries(Object.entries({
    id: normalizeSnippet(value.id, 96),
    kind: ["setup", "promised_payoff", "accepted_consequence"].includes(kind)
      ? kind
      : "setup",
    obligation,
    status,
    result,
    evidence,
    source_scene_heading: normalizeSnippet(
      value.sourceSceneHeading ?? value.source_scene_heading,
      140
    ),
    source_act: normalizeSnippet(value.sourceAct ?? value.source_act, 80),
    source_position: Math.max(0, Math.round(Number(
      value.sourcePosition ?? value.source_position ?? 0
    ))),
    accepted_at: Math.max(0, Number(value.acceptedAt ?? value.accepted_at ?? 0)),
  }).filter(([, item]) => typeof item === "number" ? item > 0 : Boolean(item)));
}

function normalizeStoryObligationCorrectionsForApi(value = []) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obligation = normalizeSnippet(item.obligation, 220);
    const action = normalizeSnippet(item.action, 32).toLowerCase().replace(/[\s-]+/g, "_");
    const correctedAt = Math.max(0, Number(item.correctedAt ?? item.corrected_at ?? 0));
    const key = obligation.toLowerCase();
    if (!obligation || !["keep_open", "retire"].includes(action) || !correctedAt || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(Object.fromEntries(Object.entries({
      id: normalizeSnippet(item.id, 96),
      obligation,
      action,
      note: normalizeSnippet(item.note, 240),
      source_change_id: normalizeSnippet(item.sourceChangeId ?? item.source_change_id, 96),
      source_status: normalizeSnippet(item.sourceStatus ?? item.source_status, 32),
      corrected_at: correctedAt,
    }).filter(([, value]) => typeof value === "number" ? value > 0 : Boolean(value))));
    if (out.length >= 24) break;
  }
  return out;
}

function normalizeScreenplayPhaseValue(value) {
  return normalizeSnippet(value, 48) || "scene_draft";
}

export {
  normalizeAuthenticatedUserId,
  normalizeCharacterBibleCardArc,
  normalizeCharacterBibleCardList,
  normalizeClientIp,
  normalizeClientToken,
  normalizeDialogueIdPart,
  normalizeDialogueSegmentKind,
  normalizeEmailAddress,
  normalizeFactKey,
  normalizeHistoryRole,
  normalizeIdempotencyKey,
  normalizeKnowledgeTags,
  normalizeKnowledgeTopic,
  normalizeLocalActionType,
  normalizeMemoryCardId,
  normalizeMemoryQualitySignal,
  normalizePromptSeed,
  normalizeRememberSnippet,
  normalizeRememberedRelation,
  normalizeScreenplayActKey,
  normalizeScreenplayActStatus,
  normalizeScreenplayCompanionTimestamp,
  normalizeScreenplayCorrectionTerm,
  normalizeScreenplayMemoryInteger,
  normalizeScreenplayMemoryMotif,
  normalizeScreenplayMultilineSnippet,
  normalizeScreenplayOwnerValue,
  normalizeScreenplayPhaseValue,
  normalizeScreenplayStringList,
  normalizeSpeculativeKey,
  normalizeSpeculativePromptHash,
  normalizeSpeculativeTranscript,
  normalizeSpeechCompare,
  normalizeStoredScreenplayDiffAcknowledgedKey,
  normalizeStoredScreenplayThreadViewState,
  normalizeStoredScreenplayWriteAnchor,
  normalizeStoryObligationChangeForApi,
  normalizeStoryObligationCorrectionsForApi,
  normalizeTalkMultilineSnippet,
  normalizeTalkScreenplayInsertionMode,
  normalizeTaskPriority,
  normalizeThemeLabel,
  normalizeThemeReason,
  normalizeThemeSource,
  normalizeThemeSummary,
  normalizeThemeTone,
  normalizeThreadReferenceHintTemplate,
  normalizeVisualDescriptor,
  normalizeWhitespace,
};
