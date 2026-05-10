// Craft analysis — MVP deterministic stub.
//
// `analyzeScreenplay({ screenplay, frameworkId, projectId, versionId })`
// produces a ScreenplayCraftReport that satisfies the schema and the
// Swift Codable contract from T17. The stub does NOT do real beat
// classification; it produces a synthetic report shaped like a real
// one so client work (T19, T20) can proceed against actual data.
//
// Real LLM-driven classification is T21. The function signature here
// is the contract T21 will implement; the stub returns reasonable
// defaults so endpoints respond with valid data immediately.
//
// In-memory report and override stores live here for MVP. Persistence
// across process restarts is T22.

import {
  getFrameworkById,
  isKnownFrameworkId,
} from "./craft_frameworks.js";
import { CRAFT_SCHEMA_VERSION } from "./craft_schemas.js";

const reportsByKey = new Map();   // `${projectId}:${versionId || ''}` -> Report
const overridesById = new Map();  // overrideId -> TurnOverride
const overridesByReport = new Map(); // reportId -> Set<overrideId>

let overrideCounter = 0;
function nextOverrideId() {
  overrideCounter += 1;
  return `ov_${Date.now().toString(36)}_${overrideCounter}`;
}

function reportStorageKey({ projectId, versionId }) {
  const proj = String(projectId || "").trim();
  const ver = String(versionId || "").trim();
  if (!proj) return null;
  return ver ? `${proj}:${ver}` : `${proj}:`;
}

function getStoredReport({ projectId, versionId }) {
  const key = reportStorageKey({ projectId, versionId });
  if (!key) return null;
  return reportsByKey.get(key) || null;
}

function storeReport(report) {
  const key = reportStorageKey({
    projectId: report.projectId,
    versionId: report.versionId,
  });
  if (!key) return;
  reportsByKey.set(key, report);
}

// Pure: produce a Report from a framework + minimal screenplay info.
// `screenplay` is intentionally loose — for MVP, only `pageCount` and
// `title` are read. Future commits / T21 will replace this with real
// scene analysis.
function analyzeScreenplay({
  screenplay = {},
  frameworkId,
  projectId,
  versionId,
  generatedAt = null,
}) {
  if (!isKnownFrameworkId(frameworkId)) {
    const err = new Error(`unknown framework id: ${frameworkId}`);
    err.code = "craft_invalid_framework_id";
    throw err;
  }
  if (!projectId || typeof projectId !== "string") {
    const err = new Error("projectId is required");
    err.code = "craft_invalid_screenplay";
    throw err;
  }

  const framework = getFrameworkById(frameworkId);
  const pageCount = Number.isInteger(screenplay.pageCount) && screenplay.pageCount > 0
    ? screenplay.pageCount
    : 110;
  const generated = generatedAt || new Date().toISOString();
  const reportId = `report_${projectId}_${versionId || "v"}_${Date.now().toString(36)}`;

  const requiredMajorTurns = framework.beats.filter(
    (b) => b.required && b.majorTurnId,
  );

  // Build major turns: stub marks all required as detected at their
  // expected page. Real analysis (T21) will compute actualPage from
  // scene classification.
  const majorTurns = requiredMajorTurns.map((beatDef) => {
    const expectedPage = beatDef.expectedPageRange
      ? Math.round((beatDef.expectedPageRange.start + beatDef.expectedPageRange.end) / 2)
      : null;
    const turn = {
      id: `mt_${beatDef.majorTurnId}_${reportId}`,
      turnId: beatDef.majorTurnId,
      label: beatDef.label,
      required: true,
      status: "present",
      detected: true,
      evidence: [],
    };
    if (expectedPage !== null) turn.expectedPage = expectedPage;
    if (beatDef.expectedPageRange) turn.expectedPageRange = { ...beatDef.expectedPageRange };
    if (expectedPage !== null) turn.actualPage = expectedPage;
    if (beatDef.expectedPageRange) turn.actualPageRange = { ...beatDef.expectedPageRange };
    if (expectedPage !== null) turn.driftPages = 0;
    turn.confidence = 0.5; // stub confidence
    return turn;
  });

  // Build beat sheet: stub produces a beat per framework beat with
  // status "present" if required, "unclassified" otherwise.
  const beats = framework.beats.map((beatDef) => {
    const beat = {
      id: `b_${beatDef.id}_${reportId}`,
      frameworkBeatId: beatDef.id,
      label: beatDef.label,
      status: beatDef.required ? "present" : "unclassified",
      classificationSource: "stub",
      evidence: [],
    };
    if (beatDef.summary) beat.summary = beatDef.summary;
    if (beatDef.expectedPageRange) {
      beat.expectedPageRange = { ...beatDef.expectedPageRange };
      beat.actualPageRange = { ...beatDef.expectedPageRange };
    }
    if (beatDef.majorTurnId) beat.majorTurnId = beatDef.majorTurnId;
    return beat;
  });

  const beatSheet = {
    id: `beats_${projectId}_${versionId || "v"}`,
    frameworkId: framework.id,
    title: `${framework.title} — ${screenplay.title || projectId}`,
    beats,
  };

  const drift = {
    status: "on-target",
    summary: "Stub analysis: all required major turns assumed at expected pages.",
    timeline: majorTurns.map((mt) => ({
      id: `td_${mt.turnId}_${reportId}`,
      turnId: mt.turnId,
      label: mt.label,
      expectedPage: mt.expectedPage,
      actualPage: mt.actualPage,
      driftPages: mt.driftPages,
      status: "on-target",
    })),
  };

  const coverage = {
    requiredMajorTurnCount: requiredMajorTurns.length,
    detectedMajorTurnCount: majorTurns.length,
    overriddenMajorTurnCount: 0,
    missingMajorTurnCount: 0,
    complete: true,
    confidence: 0.5,
  };

  const report = {
    id: reportId,
    schemaVersion: CRAFT_SCHEMA_VERSION,
    projectId,
    framework: {
      id: framework.id,
      title: framework.title,
      version: framework.version,
    },
    pageCount,
    coverage,
    beatSheet,
    majorTurns,
    drift,
    overrides: [],
  };

  if (versionId) report.versionId = versionId;
  if (screenplay.title) report.screenplayTitle = screenplay.title;
  if (generated) report.generatedAt = generated;
  report.generatedBy = "craft-analysis-stub@1.0";
  report.summary = "Stub analysis report. Real classification arrives in T21.";

  return report;
}

// ---- Override management (in-memory MVP) ----

function recordOverride({ override, requestingUserId }) {
  if (!override || typeof override !== "object") {
    const err = new Error("override body required");
    err.code = "craft_invalid_screenplay";
    throw err;
  }
  if (!override.turnId || typeof override.turnId !== "string") {
    const err = new Error("override.turnId is required");
    err.code = "craft_invalid_screenplay";
    throw err;
  }
  if (!override.action || typeof override.action !== "string") {
    const err = new Error("override.action is required");
    err.code = "craft_invalid_screenplay";
    throw err;
  }
  // Open-question #3 (proposed): if requestingUserId is provided
  // (i.e. an authenticated request), the body's userId must match.
  if (requestingUserId && override.userId && override.userId !== requestingUserId) {
    const err = new Error("override.userId must match authenticated user");
    err.code = "craft_override_user_mismatch";
    throw err;
  }
  const id = override.id || nextOverrideId();
  const stored = {
    id,
    turnId: override.turnId,
    action: override.action,
  };
  if (override.reason)    stored.reason = override.reason;
  if (override.sceneId)   stored.sceneId = override.sceneId;
  if (Number.isInteger(override.page)) stored.page = override.page;
  if (override.userId || requestingUserId) stored.userId = override.userId || requestingUserId;
  stored.createdAt = override.createdAt || new Date().toISOString();
  if (override.expiresAt) stored.expiresAt = override.expiresAt;
  overridesById.set(id, stored);
  return stored;
}

function deleteOverride(id) {
  if (!overridesById.has(id)) {
    const err = new Error(`override not found: ${id}`);
    err.code = "craft_override_not_found";
    throw err;
  }
  overridesById.delete(id);
}

function getOverride(id) {
  return overridesById.get(id) || null;
}

// Test seam — let tests reset the in-memory state.
function _resetCraftStores() {
  reportsByKey.clear();
  overridesById.clear();
  overridesByReport.clear();
  overrideCounter = 0;
}

export {
  analyzeScreenplay,
  storeReport,
  getStoredReport,
  recordOverride,
  deleteOverride,
  getOverride,
  _resetCraftStores,
};
