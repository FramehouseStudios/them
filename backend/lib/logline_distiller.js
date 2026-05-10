// T-logline-distiller — Layer 2 of the Craft Intelligence Suite.
//
// Extracts a one-sentence logline from screenplay text and tracks
// drift over the project's logline history. Three pure surfaces:
//
//   distillLogline({ text, frameworkId?, classifier? }) -> string
//   recordLogline({ persistence, projectId, versionId?, logline })
//     -> stored entry
//   getLoglineHistory({ persistence, projectId, limit? }) -> entries[]
//   computeDrift({ persistence, projectId, currentLogline })
//     -> { score, current, earliest, summary }
//
// The distiller works in two modes:
//   - Deterministic stub (default): builds a template logline from the
//     first scene heading + first character cue. Useful for tests and
//     local dev without an LLM.
//   - LLM-driven: when an `OPENAI_API_KEY` is set in the env (or a
//     `classifier` with kind="openai" is supplied), call the model via
//     a JSON-mode prompt and return its single-sentence answer. Mirrors
//     the T21 classifier pattern: same interface, swappable behind a
//     factory.
//
// Drift score is the Jaccard distance between word sets of the current
// logline and the EARLIEST one in history. 0 = identical; 1 = nothing
// in common. The score is informational — surfaces in the iOS left
// rail when ≥0.4 so the writer can see they've drifted from their
// own opening pitch.

import { createDefaultClassifier } from "./craft_classifier.js";

const LOGLINE_SCHEMA_VERSION = 1;
const DOMAIN = "craft_loglines";
const KEY_PREFIX = "entry:";
const MAX_LOGLINE_CHARS = 280;

// ---------- text utilities ----------

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function normalizeLogline(s) {
  let line = String(s || "").replace(/\r\n?/g, " ").replace(/\n/g, " ").trim();
  // Collapse internal whitespace.
  line = line.replace(/\s+/g, " ");
  // Strip surrounding quotes a model sometimes wraps the line in.
  line = line.replace(/^["']+|["']+$/g, "").trim();
  // Bound length.
  if (line.length > MAX_LOGLINE_CHARS) line = line.slice(0, MAX_LOGLINE_CHARS - 1).trim() + "…";
  return line;
}

function wordsFrom(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

// Jaccard distance: 1 - |A ∩ B| / |A ∪ B|.
function jaccardDistance(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 1;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : 1 - inter / union;
}

// ---------- deterministic stub ----------

function firstSceneHeading(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(INT\.|EXT\.|INT\/EXT|I\/E\.)/i.test(trimmed)) return trimmed;
  }
  return "";
}

function firstCharacterCue(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    // Skip scene headings.
    if (/^(INT\.|EXT\.|INT\/EXT|I\/E\.)/i.test(trimmed)) continue;
    // Match cue shape: ALL CAPS, 2-40 chars, letters + digits + . ' - and optional (V.O.) etc.
    if (/^[A-Z][A-Z0-9 .'\-()]{1,38}[A-Z0-9)]$/.test(trimmed)) {
      // Must be followed by non-empty dialogue (not another cue).
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j += 1;
      if (j < lines.length && lines[j].trim()) {
        // Strip any parenthetical extension like " (V.O.)".
        return trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
      }
    }
  }
  return "";
}

function deterministicLogline({ text, frameworkId }) {
  const heading = firstSceneHeading(text);
  const cue = firstCharacterCue(text);
  if (heading && cue) {
    const setting = heading.replace(/^(INT\.|EXT\.|INT\/EXT|I\/E\.)\s*/i, "").trim();
    return normalizeLogline(`In ${setting}, ${cue} faces a defining challenge that tests who they are.`);
  }
  if (cue) return normalizeLogline(`${cue} faces a defining challenge that tests who they are.`);
  if (heading) return normalizeLogline(`A story set ${heading.toLowerCase()} about a defining challenge.`);
  const fw = frameworkId ? ` (${frameworkId})` : "";
  return normalizeLogline(`A character faces a defining challenge that changes them forever${fw}.`);
}

// ---------- LLM distillation ----------

async function llmLogline({ text, frameworkId, classifier }) {
  if (!classifier || typeof classifier.classifyScene !== "function") {
    // Fall back to deterministic if the classifier doesn't expose a
    // scene-level method we can repurpose.
    return deterministicLogline({ text, frameworkId });
  }
  // We piggyback on the classifier's classifyScene by sending the
  // full screenplay excerpt as a "scene" with a prompt that asks for
  // a logline. The classifier's strict-JSON contract makes this
  // robust against free-form model variation.
  try {
    const result = await classifier.classifyScene({
      framework: frameworkId || "save-the-cat",
      scene: {
        title: "LOGLINE REQUEST",
        text:
          "Write a single screenplay logline of <=280 characters for the screenplay below. " +
          "Return JSON: { \"beatId\": \"logline\", \"confidence\": 1, \"rationale\": \"<the logline>\" }.\n\n" +
          String(text || "").slice(0, 6000),
      },
    });
    const candidate = result?.rationale && typeof result.rationale === "string"
      ? result.rationale
      : "";
    if (!candidate) return deterministicLogline({ text, frameworkId });
    return normalizeLogline(candidate);
  } catch (_e) {
    return deterministicLogline({ text, frameworkId });
  }
}

// ---------- public surface ----------

async function distillLogline({
  text = "",
  frameworkId = null,
  classifier = null,
  forceMode = null,
} = {}) {
  const useLLM = forceMode
    ? forceMode === "llm"
    : (classifier && classifier.kind === "openai");
  if (useLLM && classifier) {
    return llmLogline({ text, frameworkId, classifier });
  }
  return deterministicLogline({ text, frameworkId });
}

function storageKey({ projectId, versionId, distilledAtMs }) {
  const proj = trimToString(projectId);
  const ver = trimToString(versionId);
  const ts = Number(distilledAtMs) || Date.now();
  // ISO timestamp keeps lex-sort = chronological.
  const iso = new Date(ts).toISOString();
  if (!proj) return null;
  return ver
    ? `${KEY_PREFIX}${proj}:${ver}:${iso}`
    : `${KEY_PREFIX}${proj}::${iso}`;
}

async function recordLogline({
  persistence,
  projectId,
  versionId = null,
  logline,
  frameworkId = null,
  source = "stub",
  distilledAtMs = Date.now(),
} = {}) {
  if (!persistence || typeof persistence.put !== "function") {
    throw new Error("recordLogline requires a persistence handle");
  }
  const proj = trimToString(projectId);
  if (!proj) throw new Error("recordLogline requires a projectId");
  const cleanLogline = normalizeLogline(logline);
  if (!cleanLogline) throw new Error("recordLogline requires a non-empty logline");
  const key = storageKey({ projectId: proj, versionId, distilledAtMs });
  const entry = {
    schemaVersion: LOGLINE_SCHEMA_VERSION,
    projectId: proj,
    versionId: trimToString(versionId) || null,
    logline: cleanLogline,
    frameworkId: trimToString(frameworkId) || null,
    source: trimToString(source) || "stub",
    distilledAt: new Date(distilledAtMs).toISOString(),
    distilledAtMs,
  };
  await persistence.put({ domain: DOMAIN, key, value: entry });
  return entry;
}

async function getLoglineHistory({ persistence, projectId, limit = 100 } = {}) {
  if (!persistence || typeof persistence.list !== "function") {
    throw new Error("getLoglineHistory requires a persistence handle");
  }
  const proj = trimToString(projectId);
  if (!proj) return [];
  const records = await persistence.list({
    domain: DOMAIN,
    prefix: `${KEY_PREFIX}${proj}:`,
    limit: Math.max(1, Math.min(10_000, Math.floor(Number(limit) || 100))),
  });
  // records are already sorted by key ascending (ISO timestamp → chrono).
  return (records || []).map((r) => r.value).filter((v) => v && v.logline);
}

async function computeDrift({
  persistence,
  projectId,
  currentLogline = null,
} = {}) {
  const history = await getLoglineHistory({ persistence, projectId });
  if (!history.length) {
    return {
      score: 0,
      current: currentLogline ? normalizeLogline(currentLogline) : "",
      earliest: "",
      historyCount: 0,
      summary: "No logline history yet.",
    };
  }
  const earliest = history[0].logline;
  const current = currentLogline
    ? normalizeLogline(currentLogline)
    : history[history.length - 1].logline;
  const score = jaccardDistance(wordsFrom(earliest), wordsFrom(current));
  let summary;
  if (score < 0.2) summary = "Logline holds tight to the original pitch.";
  else if (score < 0.4) summary = "Logline has shifted slightly from the original.";
  else if (score < 0.7) summary = "Logline has drifted meaningfully from the original pitch.";
  else summary = "Logline has diverged sharply from the original pitch.";
  return {
    score: Math.round(score * 1000) / 1000,
    current,
    earliest,
    historyCount: history.length,
    summary,
  };
}

// Test seam.
async function _clearLoglines(persistence) {
  if (!persistence || typeof persistence.clear !== "function") return;
  await persistence.clear({ domain: DOMAIN });
}

// Default classifier factory — convenience for the route layer.
function _defaultClassifier() {
  return createDefaultClassifier();
}

// ---------- module-level configuration (for routes) ----------
// Routes call configureLoglineDistiller at app startup. Tests pass
// `persistence` directly; production routes read from the configured
// deps.

let configuredDeps = { persistence: null, classifier: null };

function configureLoglineDistiller({ persistence = null, classifier = null } = {}) {
  configuredDeps = { persistence, classifier };
}

function loglineDistillerDeps() {
  return configuredDeps;
}

export {
  distillLogline,
  recordLogline,
  getLoglineHistory,
  computeDrift,
  normalizeLogline,
  jaccardDistance,
  wordsFrom,
  storageKey,
  LOGLINE_SCHEMA_VERSION,
  DOMAIN as LOGLINE_DOMAIN,
  configureLoglineDistiller,
  loglineDistillerDeps,
  _clearLoglines,
  _defaultClassifier,
};
