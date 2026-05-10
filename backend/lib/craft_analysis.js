// Craft analysis — analyzeScreenplay() + persistent storage for reports
// and overrides via the T07 persistence adapter.
//
// `analyzeScreenplay({ screenplay, frameworkId, projectId, versionId })`
// produces a ScreenplayCraftReport that satisfies the schema and the
// Swift Codable contract from T17. The MVP body is a deterministic
// stub; T21 replaces it with real LLM-driven beat classification.
//
// Storage:
//   craft_reports     — keyed by `${projectId}:${versionId || ''}`,
//                        value is the full Report.
//   craft_overrides   — keyed by override id (UUID; survives restart).
//
// The persistence handle is injected via configureCraftAnalysis(...).
// Tests configure with their own (json-temp-rooted) handle so each
// test gets isolated state. Production wiring at startup uses the
// shared adapter from createPersistence() in backend/index.js.

import { randomUUID } from "node:crypto";

import {
  getFrameworkById,
  isKnownFrameworkId,
} from "./craft_frameworks.js";
import { CRAFT_SCHEMA_VERSION } from "./craft_schemas.js";
import { createPersistence } from "./persistence_adapter.js";

const REPORTS_DOMAIN = "craft_reports";
const OVERRIDES_DOMAIN = "craft_overrides";

let configuredDeps = null;

function configureCraftAnalysis(deps = {}) {
  configuredDeps = { persistence: deps.persistence || null };
}

function craftAnalysisDeps() {
  if (!configuredDeps || !configuredDeps.persistence) {
    // Fallback for callers that did not configure: instantiate a
    // default persistence handle. Production should call
    // configureCraftAnalysis({ persistence: sharedPersistence }) at
    // startup; tests should always configure explicitly.
    configuredDeps = { persistence: createPersistence() };
  }
  return configuredDeps;
}

function reportStorageKey({ projectId, versionId }) {
  const proj = String(projectId || "").trim();
  const ver = String(versionId || "").trim();
  if (!proj) return null;
  return ver ? `${proj}:${ver}` : `${proj}:`;
}

async function getStoredReport({ projectId, versionId }) {
  const key = reportStorageKey({ projectId, versionId });
  if (!key) return null;
  const { persistence } = craftAnalysisDeps();
  return persistence.get({ domain: REPORTS_DOMAIN, key });
}

async function storeReport(report) {
  const key = reportStorageKey({
    projectId: report?.projectId,
    versionId: report?.versionId,
  });
  if (!key) return;
  const { persistence } = craftAnalysisDeps();
  await persistence.put({ domain: REPORTS_DOMAIN, key, value: report });
}

// Pure: produce a Report from a framework + minimal screenplay info.
// `screenplay` is intentionally loose — for MVP, only `pageCount` and
// `title` are read. T21 replaces this with real scene analysis.
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
    turn.confidence = 0.5;
    return turn;
  });

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

// ---- Override management (persistence-backed) ----

function nextOverrideId() {
  return `ov_${randomUUID()}`;
}

async function recordOverride({ override, requestingUserId }) {
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
  const { persistence } = craftAnalysisDeps();
  await persistence.put({ domain: OVERRIDES_DOMAIN, key: id, value: stored });
  return stored;
}

async function deleteOverride(id) {
  const { persistence } = craftAnalysisDeps();
  const existing = await persistence.get({ domain: OVERRIDES_DOMAIN, key: id });
  if (!existing) {
    const err = new Error(`override not found: ${id}`);
    err.code = "craft_override_not_found";
    throw err;
  }
  await persistence.delete({ domain: OVERRIDES_DOMAIN, key: id });
}

async function getOverride(id) {
  const { persistence } = craftAnalysisDeps();
  return persistence.get({ domain: OVERRIDES_DOMAIN, key: id });
}

// Test seam — drops the configured deps so the next call creates a
// fresh persistence handle. For json-mode tests, set
// PERSISTENCE_JSON_ROOT to a fresh tmp dir before reset.
function _resetCraftStores() {
  configuredDeps = null;
}

export {
  analyzeScreenplay,
  storeReport,
  getStoredReport,
  recordOverride,
  deleteOverride,
  getOverride,
  configureCraftAnalysis,
  _resetCraftStores,
  REPORTS_DOMAIN,
  OVERRIDES_DOMAIN,
};
