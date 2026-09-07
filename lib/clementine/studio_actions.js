// Studio Actions — voice → studio tabs mapping (openStudio/refreshCoverage/selectBeat) with validation.
// D009 strangler under lib/clementine; backend/index.js stays at 33626.
// Pure helper: maps voice intents/utterances to studio tab actions without growing god file.

export const STUDIO_ACTIONS = Object.freeze(["openStudio", "refreshCoverage", "selectBeat"]);
export const STUDIO_TABS = Object.freeze(["editor", "coverage", "beats", "mentor", "outline", "page", "studio"]);

export const VOICE_INTENT_TO_ACTION = Object.freeze({
  openStudio: "openStudio",
  refreshCoverage: "refreshCoverage",
  selectBeat: "selectBeat",
});

function trimToString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizeType(t) {
  return trimToString(t);
}

function isValidActionType(t) {
  return STUDIO_ACTIONS.includes(t);
}

function isValidTab(tab) {
  if (!tab) return true; // optional
  return STUDIO_TABS.includes(trimToString(tab).toLowerCase());
}

/**
 * Validate a studio action object.
 * Returns { valid: boolean, error?: string, normalized?: object }
 * Does not throw for invalid; caller can check valid. Also exported assert variant throws.
 */
export function validateStudioAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return { valid: false, error: "action must be an object" };
  }
  const type = normalizeType(action.type || action.action || action.name);
  if (!type) return { valid: false, error: "type is required" };
  if (!isValidActionType(type)) return { valid: false, error: `unknown action type: ${type}` };

  if (type === "openStudio") {
    const tab = action.tab !== undefined ? trimToString(action.tab) : "";
    if (tab && !isValidTab(tab)) return { valid: false, error: `invalid tab: ${tab}` };
    return { valid: true, normalized: { type, ...(tab ? { tab: tab.toLowerCase() } : {}) } };
  }

  if (type === "refreshCoverage") {
    const projectId = action.projectId !== undefined ? trimToString(action.projectId) : "";
    // projectId optional; if provided must be non-empty after trim (already)
    // also allow coverage tab hint
    const tab = action.tab !== undefined ? trimToString(action.tab) : "";
    if (tab && tab.toLowerCase() !== "coverage" && !isValidTab(tab)) return { valid: false, error: `invalid tab: ${tab}` };
    // whitespace-only projectId is treated as absent (valid)
    const normalized = { type };
    if (projectId) normalized.projectId = projectId;
    if (tab) normalized.tab = tab.toLowerCase();
    return { valid: true, normalized };
  }

  if (type === "selectBeat") {
    const beatId = trimToString(action.beatId || action.beat_id || action.id || action.beat);
    if (!beatId) return { valid: false, error: "beatId is required for selectBeat" };
    // beatId must be non-empty string, allow b1..b90 or any slug but not just whitespace
    if (beatId.length > 64) return { valid: false, error: "beatId too long" };
    // optional beats validation if provided via second arg or action.beats
    // caller can pass context beats separately; we check if action._beats provided
    const beats = action._beats || action.beats || null;
    if (Array.isArray(beats) && beats.length > 0) {
      const ids = beats.map((b) => {
        if (!b) return "";
        if (typeof b === "string") return trimToString(b).toLowerCase();
        return trimToString(b.id || b.beatId || b.beat_id || b.title).toLowerCase();
      });
      if (!ids.includes(beatId.toLowerCase())) {
        return { valid: false, error: `unknown beatId: ${beatId}` };
      }
    }
    // optional beatIndex validation 1..90
    if (action.beatIndex !== undefined) {
      const n = Number(action.beatIndex);
      if (!Number.isFinite(n) || Math.round(n) < 1 || Math.round(n) > 90) {
        return { valid: false, error: "beatIndex must be integer 1..90" };
      }
    }
    const normalized = { type, beatId };
    if (action.beatIndex !== undefined) normalized.beatIndex = Math.round(Number(action.beatIndex));
    if (action.tab) {
      const tab = trimToString(action.tab);
      if (tab && !isValidTab(tab)) return { valid: false, error: `invalid tab: ${tab}` };
      if (tab) normalized.tab = tab.toLowerCase();
    }
    return { valid: true, normalized };
  }

  return { valid: false, error: `unhandled type: ${type}` };
}

export function assertValidStudioAction(action) {
  const res = validateStudioAction(action);
  if (!res.valid) {
    const err = new Error(res.error || "invalid studio action");
    err.code = "studio_action_invalid";
    throw err;
  }
  return res.normalized;
}

/**
 * Build a studio action with validation. Throws on invalid.
 */
export function buildStudioAction(type, params = {}) {
  const raw = { type, ...params };
  return assertValidStudioAction(raw);
}

/**
 * Map a voice utterance (or intent hint) to a studio action.
 * Pure heuristic; returns { type, ... } or null if no mapping.
 * opts may include { beats, projectId } for validation context.
 */
export function mapVoiceIntentToStudioAction(utterance, opts = {}) {
  const text = trimToString(utterance).toLowerCase();
  if (!text) return null;

  // explicit intent hints take precedence
  const hint = trimToString(opts.intent || opts.action || "").toLowerCase();
  if (hint === "openstudio" || hint === "open_studio") {
    const tab = opts.tab ? trimToString(opts.tab).toLowerCase() : "";
    const candidate = { type: "openStudio", ...(tab ? { tab } : {}) };
    const v = validateStudioAction(candidate);
    return v.valid ? v.normalized : null;
  }
  if (hint === "refreshcoverage" || hint === "refresh_coverage") {
    const candidate = { type: "refreshCoverage", ...(opts.projectId ? { projectId: String(opts.projectId) } : {}) };
    const v = validateStudioAction(candidate);
    return v.valid ? v.normalized : null;
  }
  if (hint === "selectbeat" || hint === "select_beat") {
    const beatId = trimToString(opts.beatId || opts.beat_id || opts.beat || "");
    if (!beatId) return null;
    const candidate = { type: "selectBeat", beatId, ...(opts.beatIndex !== undefined ? { beatIndex: opts.beatIndex } : {}), ...(opts.beats ? { _beats: opts.beats } : {}) };
    const v = validateStudioAction(candidate);
    return v.valid ? v.normalized : null;
  }

  // heuristic utterance parsing
  // openStudio: "open studio", "show studio", "go to studio", "open editor", "show mentor tab"
  if (/\b(open|show|go to|switch to)\b.*\b(studio|editor|mentor|outline|beats|coverage|page)\b/.test(text) || /^\s*open studio\s*$/i.test(text) || /\bstudio\b.*\b(open|show)\b/.test(text)) {
    // detect tab mention
    let tab = "";
    if (/\bcoverage\b/.test(text)) tab = "coverage";
    else if (/\bbeats?\b/.test(text) || /\boutline\b/.test(text)) tab = "beats";
    else if (/\bmentor\b/.test(text)) tab = "mentor";
    else if (/\beditor\b/.test(text) || /\bpage\b/.test(text)) tab = "editor";
    // bare open studio without tab is valid
    if (/\bopen studio\b/.test(text) && !tab) return { type: "openStudio" };
    // if tab detected, include it; otherwise openStudio bare
    if (tab) return { type: "openStudio", tab };
    // generic open studio
    if (/\bstudio\b/.test(text)) return { type: "openStudio" };
    if (tab) return { type: "openStudio", tab };
  }

  // refreshCoverage: "refresh coverage", "update coverage", "reload coverage", "coverage refresh"
  if (/\b(refresh|reload|update|recalculate|show)\b.*\bcoverage\b/.test(text) || /\bcoverage\b.*\b(refresh|reload|update)\b/.test(text)) {
    const candidate = { type: "refreshCoverage", ...(opts.projectId ? { projectId: String(opts.projectId) } : {}) };
    const v = validateStudioAction(candidate);
    return v.valid ? v.normalized : candidate;
  }

  // selectBeat: "select beat 3", "go to beat 5", "open beat b2", "beat 1", "jump to beat 12"
  // capture beat identifier
  const beatMatch = text.match(/\bbeat\s*(?:#?\s*)?([a-z0-9_-]{1,16})\b/i) || text.match(/\b(b\d{1,2})\b/i);
  if (beatMatch) {
    // ensure utterance actually intends selection (not just mentioning word beat without verb)
    if (/\b(select|go to|open|jump to|show|pick|choose)\b.*\bbeat\b/.test(text) || /\bbeat\s+\d+/.test(text) || /\bb\d{1,2}\b/.test(text)) {
      let rawId = (beatMatch[1] || beatMatch[0]).trim();
      // normalize numeric beat to bN form
      if (/^\d{1,2}$/.test(rawId)) rawId = `b${rawId}`;
      if (/^b\d{1,2}$/i.test(rawId)) rawId = rawId.toLowerCase();
      const candidate = { type: "selectBeat", beatId: rawId, ...(opts.beats ? { _beats: opts.beats } : {}) };
      const v = validateStudioAction(candidate);
      // if beats context invalid, still return null to signal validation failed
      if (!v.valid && opts.beats) return null;
      return v.valid ? v.normalized : { type: "selectBeat", beatId: rawId };
    }
  }

  // fallback: direct "beat 3" without verb but numeric
  const bareBeatNum = text.match(/^\s*beat\s+(\d{1,2})\s*$/i);
  if (bareBeatNum) {
    const rawId = `b${bareBeatNum[1]}`;
    const candidate = { type: "selectBeat", beatId: rawId, ...(opts.beats ? { _beats: opts.beats } : {}) };
    const v = validateStudioAction(candidate);
    if (!v.valid && opts.beats) return null;
    return v.valid ? v.normalized : { type: "selectBeat", beatId: rawId };
  }

  return null;
}

// alias for request contract: parseStudioAction accepts string utterance or object
export function parseStudioAction(input, opts = {}) {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") {
    return mapVoiceIntentToStudioAction(input, opts);
  }
  if (typeof input === "object") {
    // if object already looks like action, validate it
    if (input.type || input.action || input.name) {
      const v = validateStudioAction(input);
      return v.valid ? v.normalized : null;
    }
    // if object has utterance field
    if (typeof input.utterance === "string") {
      return mapVoiceIntentToStudioAction(input.utterance, { ...opts, ...input });
    }
  }
  return null;
}

export default {
  STUDIO_ACTIONS,
  STUDIO_TABS,
  VOICE_INTENT_TO_ACTION,
  validateStudioAction,
  assertValidStudioAction,
  buildStudioAction,
  mapVoiceIntentToStudioAction,
  parseStudioAction,
};
