import { createHash } from "node:crypto";
import { stableCanonicalJson } from "./screenplay_outline_protocol.js";

const VOICE_PROJECT_BRIEF_SCHEMA_VERSION = 1;
const MAX_VOICE_PROJECT_BRIEF_RECEIPTS = 64;
const FIELD_ORDER = Object.freeze([
  "format",
  "premise",
  "genre",
  "tone",
  "characters",
  "protagonist",
  "locations",
  "goal",
  "stakes",
  "storyClock",
  "constraints",
  "targetPages",
  "deliveryDeadline",
]);
const OPTIONAL_FIELDS = new Set(["deliveryDeadline"]);
const ARRAY_FIELD_LIMITS = Object.freeze({
  characters: { count: 16, itemLength: 80 },
  locations: { count: 12, itemLength: 120 },
  constraints: { count: 16, itemLength: 240 },
});
const FIELD_STATES = new Set(["unset", "candidate", "confirmed", "skipped", "provisional"]);

function cleanText(value, max = 600) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function safeRevision(value, fallback = 0) {
  const number = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function normalizeRequestId(value) {
  if (typeof value !== "string") return "";
  const requestId = value.trim();
  return requestId.length <= 96 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(requestId) ? requestId : "";
}

function normalizeFieldName(value) {
  const compact = cleanText(value, 40).replace(/[_\-\s]/g, "").toLowerCase();
  return FIELD_ORDER.find((field) => field.toLowerCase() === compact) || "";
}

function normalizeFieldValue(field, value) {
  const arrayLimits = ARRAY_FIELD_LIMITS[field];
  if (arrayLimits) {
    if (!Array.isArray(value)) return null;
    const seen = new Set();
    const normalized = [];
    for (const item of value) {
      const normalizedItem = cleanText(item, arrayLimits.itemLength);
      if (!normalizedItem) continue;
      const identity = normalizedItem.toLowerCase();
      if (seen.has(identity)) continue;
      seen.add(identity);
      normalized.push(normalizedItem);
      if (normalized.length >= arrayLimits.count) break;
    }
    return normalized.length ? normalized : null;
  }
  if (field === "targetPages") {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 1 && number <= 300 ? number : null;
  }
  const max = field === "premise" ? 1_000 : field === "storyClock" || field === "deliveryDeadline" ? 160 : 600;
  const text = cleanText(value, max);
  return text || null;
}

function emptyField() {
  return { state: "unset", value: null };
}

function normalizeField(field, value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const state = FIELD_STATES.has(source.state) ? source.state : "unset";
  if (state === "skipped") return { state, value: null };
  const normalizedValue = normalizeFieldValue(field, source.value);
  if (state === "provisional") return { state, value: normalizedValue };
  if (!normalizedValue) return emptyField();
  return { state, value: normalizedValue };
}

function normalizeReceipt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const requestId = normalizeRequestId(value.requestId ?? value.client_request_id);
  const requestHash = cleanText(value.requestHash, 128).toLowerCase();
  const baseRevision = safeRevision(value.baseRevision, -1);
  const committedRevision = safeRevision(value.committedRevision, -1);
  if (
    !requestId
    || !/^[a-f0-9]{64}$/.test(requestHash)
    || baseRevision < 0
    || committedRevision < baseRevision
  ) return null;
  return {
    requestId,
    requestHash,
    baseRevision,
    committedRevision,
  };
}

function normalizeReceipts(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const receipt of value.map(normalizeReceipt).filter(Boolean)) {
    const prior = byId.get(receipt.requestId);
    if (!prior || receipt.committedRevision > prior.committedRevision) byId.set(receipt.requestId, receipt);
  }
  return [...byId.values()]
    .sort((left, right) => right.committedRevision - left.committedRevision || left.requestId.localeCompare(right.requestId))
    .slice(0, MAX_VOICE_PROJECT_BRIEF_RECEIPTS);
}

function deriveBriefState(fields) {
  const requiredFields = FIELD_ORDER.filter((field) => !OPTIONAL_FIELDS.has(field));
  const nextField = requiredFields.find((field) => fields[field].state === "unset")
    || requiredFields.find((field) => fields[field].state === "candidate")
    || FIELD_ORDER.find((field) => OPTIONAL_FIELDS.has(field) && fields[field].state === "candidate")
    || null;
  const requiredStates = requiredFields.map((field) => fields[field].state);
  const status = requiredStates.every((state) => state === "unset")
      && FIELD_ORDER.every((field) => fields[field].state === "unset")
    ? "empty"
    : requiredStates.some((state) => state === "unset")
      ? "collecting"
      : FIELD_ORDER.some((field) => fields[field].state === "candidate")
        ? "review"
        : "ready";
  return { status, nextField };
}

function normalizeVoiceProjectBrief(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fields = Object.fromEntries(FIELD_ORDER.map((field) => [
    field,
    normalizeField(field, source.fields?.[field]),
  ]));
  return {
    schemaVersion: VOICE_PROJECT_BRIEF_SCHEMA_VERSION,
    revision: safeRevision(source.revision),
    ...deriveBriefState(fields),
    fields,
    receipts: normalizeReceipts(source.receipts),
  };
}

function normalizeCandidates(value) {
  const entries = Array.isArray(value)
    ? value.map((candidate) => [candidate?.field, candidate?.value])
    : value && typeof value === "object"
      ? Object.entries(value)
      : [];
  const grouped = new Map();
  for (const [rawField, rawValue] of entries) {
    const field = normalizeFieldName(rawField);
    const normalizedValue = normalizeFieldValue(field, rawValue);
    if (!field || normalizedValue == null) continue;
    const values = grouped.get(field) || new Map();
    values.set(stableCanonicalJson(normalizedValue), normalizedValue);
    grouped.set(field, values);
  }
  return Object.fromEntries(FIELD_ORDER.flatMap((field) => {
    const values = grouped.get(field);
    if (values?.size !== 1) return [];
    const firstKey = [...values.keys()].sort()[0];
    return [[field, values.get(firstKey)]];
  }));
}

function normalizeAction(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const type = cleanText(source.type ?? source.action, 40).replace(/[\s\-]/g, "_").toLowerCase();
  if (["candidates", "candidate_bundle", "propose"].includes(type)) {
    const candidates = normalizeCandidates(source.candidates ?? source.fields);
    return Object.keys(candidates).length ? { type: "candidates", candidates } : null;
  }
  if (["confirm", "correct"].includes(type)) {
    const field = normalizeFieldName(source.field);
    if (!field) return null;
    const hasValue = Object.prototype.hasOwnProperty.call(source, "value");
    const normalizedValue = hasValue ? normalizeFieldValue(field, source.value) : undefined;
    if (hasValue && normalizedValue == null) return null;
    if (type === "correct" && !hasValue) return null;
    return { type, field, ...(hasValue ? { value: normalizedValue } : {}) };
  }
  if (["skip", "skip_current"].includes(type)) return { type: "skip_current" };
  if (["you_decide", "provisional"].includes(type)) {
    const hasValue = Object.prototype.hasOwnProperty.call(source, "value");
    const field = normalizeFieldName(source.field);
    if (source.field != null && !field) return null;
    if (hasValue && !field) return null;
    const normalizedValue = hasValue && field ? normalizeFieldValue(field, source.value) : undefined;
    if (hasValue && field && normalizedValue == null) return null;
    return { type: "you_decide", ...(field ? { field } : {}), ...(hasValue ? { value: normalizedValue ?? null } : {}) };
  }
  return null;
}

function reduceVoiceProjectBrief(current, rawAction) {
  const brief = normalizeVoiceProjectBrief(current);
  const action = normalizeAction(rawAction);
  if (!action) return { ok: false, error: "invalid_action", brief };
  const fields = structuredClone(brief.fields);

  if (action.type === "candidates") {
    for (const field of FIELD_ORDER) {
      if (!Object.prototype.hasOwnProperty.call(action.candidates, field)) continue;
      if (["confirmed", "skipped", "provisional"].includes(fields[field].state)) continue;
      fields[field] = { state: "candidate", value: action.candidates[field] };
    }
  } else if (action.type === "confirm" || action.type === "correct") {
    const priorValue = fields[action.field].value;
    const value = Object.prototype.hasOwnProperty.call(action, "value") ? action.value : priorValue;
    if (value == null) return { ok: false, error: "value_required", brief };
    fields[action.field] = { state: "confirmed", value };
  } else {
    const field = action.field || brief.nextField;
    if (!field) return { ok: false, error: "brief_already_ready", brief };
    if (action.type === "you_decide" && field !== brief.nextField) {
      return { ok: false, error: "not_current_field", brief };
    }
    if (action.type === "skip_current") {
      fields[field] = { state: "skipped", value: null };
    } else {
      const value = Object.prototype.hasOwnProperty.call(action, "value")
        ? action.value
        : fields[field].value;
      fields[field] = { state: "provisional", value: value ?? null };
    }
  }

  const changed = stableCanonicalJson(fields) !== stableCanonicalJson(brief.fields);
  return {
    ok: true,
    changed,
    brief: {
      ...brief,
      revision: brief.revision + (changed ? 1 : 0),
      ...deriveBriefState(fields),
      fields,
    },
    action,
  };
}

function parseVoiceProjectBriefPrecondition(value = {}) {
  const requestValues = ["client_request_id", "clientRequestId"]
    .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
    .map((key) => typeof value[key] === "string" ? value[key].trim() : "");
  const revisionValues = ["expected_revision", "expectedRevision"]
    .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
    .map((key) => safeRevision(value[key], -1));
  const requestId = normalizeRequestId(requestValues[0]);
  const revision = revisionValues[0] ?? -1;
  if (!requestValues.length || !revisionValues.length) return { ok: false, error: "write_precondition_required" };
  if (
    !requestId
    || requestValues.some((item) => item !== requestId)
    || revision < 0
    || revisionValues.some((item) => item !== revision)
  ) return { ok: false, error: "invalid_write_precondition" };
  return { ok: true, clientRequestId: requestId, expectedRevision: revision };
}

function buildVoiceProjectBriefRequestHash(action) {
  const normalized = normalizeAction(action);
  if (!normalized) return "";
  return createHash("sha256").update(stableCanonicalJson(normalized), "utf8").digest("hex");
}

function ensureVoiceProjectBrief(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) throw new Error("project required");
  project.voiceProjectBrief = normalizeVoiceProjectBrief(project.voiceProjectBrief);
  return project.voiceProjectBrief;
}

function applyVoiceProjectBriefMutation(project, request = {}) {
  if (!project || typeof project !== "object" || Array.isArray(project)) throw new Error("project required");
  const brief = normalizeVoiceProjectBrief(project.voiceProjectBrief);
  const precondition = parseVoiceProjectBriefPrecondition(request);
  if (!precondition.ok) return { commit: false, kind: "invalid_precondition", error: precondition.error, brief };
  const action = normalizeAction(request.action ?? request);
  if (!action) return { commit: false, kind: "invalid_action", error: "invalid_action", brief };
  const requestHash = buildVoiceProjectBriefRequestHash(action);
  const prior = brief.receipts.find((receipt) => receipt.requestId === precondition.clientRequestId);
  if (prior) {
    if (prior.requestHash !== requestHash || prior.baseRevision !== precondition.expectedRevision) {
      return { commit: false, kind: "request_id_reused", conflict: true, brief };
    }
    const superseded = prior.committedRevision !== brief.revision;
    return { commit: false, kind: superseded ? "replayed_superseded" : "replayed", conflict: superseded, replayed: true, brief };
  }
  if (precondition.expectedRevision !== brief.revision) {
    return { commit: false, kind: "stale_revision", conflict: true, brief };
  }
  const reduced = reduceVoiceProjectBrief(brief, action);
  if (!reduced.ok) return { commit: false, kind: reduced.error, error: reduced.error, brief };
  const nextBrief = reduced.brief;
  nextBrief.receipts = normalizeReceipts([{
    requestId: precondition.clientRequestId,
    requestHash,
    baseRevision: brief.revision,
    committedRevision: nextBrief.revision,
  }, ...brief.receipts]);
  project.voiceProjectBrief = nextBrief;
  return { commit: true, kind: reduced.changed ? "saved" : "no_change", replayed: false, brief: nextBrief };
}

function projectTitle(project) {
  return cleanText(project?.title, 160) || "Untitled Screenplay";
}

function toVoiceProjectBriefPayload(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) throw new Error("project required");
  const brief = normalizeVoiceProjectBrief(project.voiceProjectBrief);
  return {
    schema_version: brief.schemaVersion,
    revision: brief.revision,
    status: brief.status,
    next_field: brief.nextField,
    title: projectTitle(project),
    fields: structuredClone(brief.fields),
  };
}

function buildConfirmedVoiceProjectBriefSnapshot(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) throw new Error("project required");
  const brief = normalizeVoiceProjectBrief(project.voiceProjectBrief);
  const fields = {};
  for (const field of FIELD_ORDER) {
    if (brief.fields[field].state === "confirmed") fields[field] = brief.fields[field].value;
  }
  return Object.freeze({
    schema_version: brief.schemaVersion,
    project_id: cleanText(project.id, 64),
    title: projectTitle(project),
    brief_revision: brief.revision,
    fields: Object.freeze(fields),
  });
}

export {
  VOICE_PROJECT_BRIEF_SCHEMA_VERSION,
  MAX_VOICE_PROJECT_BRIEF_RECEIPTS,
  FIELD_ORDER as VOICE_PROJECT_BRIEF_FIELD_ORDER,
  normalizeVoiceProjectBrief,
  reduceVoiceProjectBrief,
  parseVoiceProjectBriefPrecondition,
  buildVoiceProjectBriefRequestHash,
  ensureVoiceProjectBrief,
  applyVoiceProjectBriefMutation,
  toVoiceProjectBriefPayload,
  buildConfirmedVoiceProjectBriefSnapshot,
};
