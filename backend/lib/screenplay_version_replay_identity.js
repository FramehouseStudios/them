import { createHash } from "node:crypto";

const SCREENPLAY_VERSION_REPLAY_HASH_VERSION = 1;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined || typeof item === "function" || typeof item === "symbol") continue;
      result[key] = canonicalize(item);
    }
    return result;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function buildScreenplayVersionReplayHash({
  draft,
  phase,
  source,
  notes,
  studioWriteAnchors,
  screenplayBindings,
  baseVersionId,
  title,
}) {
  return createHash("sha256").update(canonicalJson({
    hashVersion: SCREENPLAY_VERSION_REPLAY_HASH_VERSION,
    draft,
    phase,
    source,
    notes,
    studioWriteAnchors,
    screenplayBindings,
    baseVersionId,
    title,
  }), "utf8").digest("hex");
}

// Versions written before the replay hash only retain these fields. Compare
// exactly what is durable and do not guess the original request's base/title.
export function legacyScreenplayVersionMatchesReplay(version, {
  draft,
  phase,
  source,
  notes,
  studioWriteAnchors,
  screenplayBindings,
}) {
  return String(version?.draft || "") === draft
    && String(version?.phase || "") === phase
    && String(version?.source || "") === source
    && String(version?.notes || "") === notes
    && canonicalJson(version?.studioWriteAnchors || []) === canonicalJson(studioWriteAnchors)
    && canonicalJson(version?.screenplayBindings || []) === canonicalJson(screenplayBindings);
}

export { SCREENPLAY_VERSION_REPLAY_HASH_VERSION };
