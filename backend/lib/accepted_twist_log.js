// T-accepted-twist-log — Craft Intelligence Suite, Layer 2 follow-up.
//
// Persists twist cards the writer accepts (from T-twist-engine's
// `POST /craft/twist/suggest` output) so future prompt assembly can
// reference the chosen reversal. Pure persistence + a compact
// `buildAcceptedTwistsBlockForPrompt(...)` helper for the prompt
// path. No LLM mode — this is bookkeeping, not generation.
//
// Storage shape (one row per acceptance):
//
//   key:  entry:<projectId>:<versionId|->:<twistId>
//   value: {
//     schemaVersion: 1,
//     projectId, versionId, frameworkId, beatId,
//     twist: { id, label, hook, severity, rationale },
//     acceptedAt, acceptedAtMs,
//     userId, sceneId, note
//   }
//
// One row per twistId per (projectId, versionId) so iOS clients can't
// accidentally double-log the same acceptance (POSTing twice with the
// same twistId updates the existing entry's acceptedAt and metadata).
// `removeAcceptedTwist` un-accepts a card; iOS uses this when the
// writer dismisses one from the timeline.

const ACCEPTED_TWIST_SCHEMA_VERSION = 1;
const DOMAIN = "accepted_twists";
const KEY_PREFIX = "entry:";
const VALID_SEVERITIES = new Set(["high", "medium", "low"]);
const MAX_HOOK_LENGTH = 480;
const MAX_LABEL_LENGTH = 120;
const MAX_RATIONALE_LENGTH = 480;
const MAX_NOTE_LENGTH = 240;
const MAX_LOG_ENTRIES = 256;
const PROMPT_BLOCK_ITEM_CAP = 6;

// ---------- helpers ----------

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function clamp(s, max) {
  if (typeof s !== "string") return "";
  const t = s.trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max - 1).trim() + "…" : t;
}

function sanitizeTwist(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const label = typeof raw.label === "string" ? clamp(raw.label, MAX_LABEL_LENGTH) : "";
  const hook = typeof raw.hook === "string" ? clamp(raw.hook, MAX_HOOK_LENGTH) : "";
  const rationale = typeof raw.rationale === "string" ? clamp(raw.rationale, MAX_RATIONALE_LENGTH) : "";
  let severity = typeof raw.severity === "string" ? raw.severity.toLowerCase().trim() : "";
  if (!VALID_SEVERITIES.has(severity)) severity = "medium";
  if (!id || !label || !hook) return null;
  return { id, label, hook, severity, rationale };
}

function storageKey({ projectId, versionId, twistId }) {
  const proj = trimToString(projectId);
  const ver = trimToString(versionId) || "-";
  const t = trimToString(twistId);
  if (!proj || !t) return null;
  return `${KEY_PREFIX}${proj}:${ver}:${t}`;
}

// ---------- public surface ----------

async function recordAcceptedTwist({
  persistence,
  projectId,
  versionId = null,
  frameworkId = null,
  beatId = null,
  twist,
  userId = null,
  sceneId = null,
  note = null,
  acceptedAtMs = Date.now(),
} = {}) {
  if (!persistence || typeof persistence.put !== "function") {
    throw new Error("recordAcceptedTwist requires a persistence handle");
  }
  const proj = trimToString(projectId);
  if (!proj) {
    const e = new Error("recordAcceptedTwist requires a projectId");
    e.code = "twist_log_invalid_input";
    throw e;
  }
  const cleanTwist = sanitizeTwist(twist);
  if (!cleanTwist) {
    const e = new Error("recordAcceptedTwist requires a valid twist (id, label, hook)");
    e.code = "twist_log_invalid_input";
    throw e;
  }
  const ver = trimToString(versionId) || null;
  const key = storageKey({ projectId: proj, versionId: ver, twistId: cleanTwist.id });
  if (!key) {
    const e = new Error("recordAcceptedTwist could not build storage key");
    e.code = "twist_log_invalid_input";
    throw e;
  }
  // Idempotent: if an entry already exists for this key, preserve the
  // original `acceptedAt` and only refresh the mutable fields.
  let existing = null;
  try {
    existing = await persistence.get({ domain: DOMAIN, key });
  } catch (_e) { /* missing is fine */ }
  const ts = Number(acceptedAtMs) || Date.now();
  const entry = {
    schemaVersion: ACCEPTED_TWIST_SCHEMA_VERSION,
    projectId: proj,
    versionId: ver,
    frameworkId: trimToString(frameworkId) || null,
    beatId: trimToString(beatId) || null,
    twist: cleanTwist,
    acceptedAt: existing && existing.acceptedAt ? existing.acceptedAt : new Date(ts).toISOString(),
    acceptedAtMs: existing && Number.isFinite(existing.acceptedAtMs) ? existing.acceptedAtMs : ts,
    lastUpdatedAt: new Date(ts).toISOString(),
    lastUpdatedAtMs: ts,
    userId: trimToString(userId) || null,
    sceneId: trimToString(sceneId) || null,
    note: typeof note === "string" ? clamp(note, MAX_NOTE_LENGTH) || null : null,
  };
  await persistence.put({ domain: DOMAIN, key, value: entry });
  return { ok: true, action: existing ? "updated" : "recorded", entry };
}

async function getAcceptedTwistsForProject({ persistence, projectId, limit = MAX_LOG_ENTRIES } = {}) {
  if (!persistence || typeof persistence.list !== "function") {
    throw new Error("getAcceptedTwistsForProject requires a persistence handle");
  }
  const proj = trimToString(projectId);
  if (!proj) return [];
  const cap = Math.max(1, Math.min(MAX_LOG_ENTRIES, Math.floor(Number(limit) || MAX_LOG_ENTRIES)));
  const records = await persistence.list({
    domain: DOMAIN,
    prefix: `${KEY_PREFIX}${proj}:`,
    limit: cap,
  });
  return (records || [])
    .map((r) => r.value)
    .filter((v) => v && v.twist && v.twist.id)
    .sort((a, b) => (Number(a.acceptedAtMs) || 0) - (Number(b.acceptedAtMs) || 0));
}

async function removeAcceptedTwist({ persistence, projectId, versionId = null, twistId } = {}) {
  if (!persistence || typeof persistence.delete !== "function") {
    throw new Error("removeAcceptedTwist requires a persistence handle");
  }
  const proj = trimToString(projectId);
  const t = trimToString(twistId);
  if (!proj || !t) {
    const e = new Error("removeAcceptedTwist requires projectId and twistId");
    e.code = "twist_log_invalid_input";
    throw e;
  }
  const key = storageKey({ projectId: proj, versionId, twistId: t });
  // Probe first so callers can distinguish "not found" from "deleted".
  const existing = await persistence.get({ domain: DOMAIN, key });
  if (!existing) {
    return { ok: false, action: "not_found" };
  }
  await persistence.delete({ domain: DOMAIN, key });
  return { ok: true, action: "removed" };
}

// Compact one-line summary suitable for embedding into a system prompt.
// Caps at PROMPT_BLOCK_ITEM_CAP twists, newest first, so older context
// doesn't crowd out the active reversal.
function buildAcceptedTwistsBlockForPrompt(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return "";
  // Newest first.
  const sorted = [...entries].sort((a, b) => (Number(b.acceptedAtMs) || 0) - (Number(a.acceptedAtMs) || 0));
  const picked = sorted.slice(0, PROMPT_BLOCK_ITEM_CAP);
  return picked
    .map((e) => {
      const beat = e.beatId ? ` @${e.beatId}` : "";
      const sev = e.twist && e.twist.severity ? ` (${e.twist.severity})` : "";
      return `- ${e.twist.label}${beat}${sev}: ${e.twist.hook}`;
    })
    .join("\n");
}

// Test seam — clear all entries in this domain.
async function _clearAcceptedTwists(persistence) {
  if (!persistence || typeof persistence.clear !== "function") return;
  await persistence.clear({ domain: DOMAIN });
}

// ---------- module-level configuration (for routes) ----------

let configuredDeps = { persistence: null };

function configureAcceptedTwistLog({ persistence = null } = {}) {
  configuredDeps = { persistence };
}

function acceptedTwistLogDeps() {
  return configuredDeps;
}

export {
  recordAcceptedTwist,
  getAcceptedTwistsForProject,
  removeAcceptedTwist,
  buildAcceptedTwistsBlockForPrompt,
  sanitizeTwist as _sanitizeTwist,
  storageKey,
  ACCEPTED_TWIST_SCHEMA_VERSION,
  DOMAIN as ACCEPTED_TWIST_DOMAIN,
  MAX_LOG_ENTRIES,
  PROMPT_BLOCK_ITEM_CAP,
  configureAcceptedTwistLog,
  acceptedTwistLogDeps,
  _clearAcceptedTwists,
};
