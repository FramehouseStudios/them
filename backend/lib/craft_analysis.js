// Evidence-driven craft analysis and persistence.
//
// Page coordinates are useful for drift only after a semantic classifier has
// identified a beat. They never prove the presence of a story turn.

import { randomUUID } from "node:crypto";

import { createDefaultClassifier } from "./craft_classifier.js";
import { getFrameworkById, isKnownFrameworkId } from "./craft_frameworks.js";
import {
  CRAFT_SCHEMA_VERSION,
  REPORT_SCHEMA,
  validateAgainstSchema,
} from "./craft_schemas.js";
import { excerptText, parseScreenplayToScenes } from "./craft_screenplay_ir.js";
import { createPersistence } from "./persistence_adapter.js";

const REPORTS_DOMAIN = "craft_reports";
const OVERRIDES_DOMAIN = "craft_overrides";
const MIN_CLASSIFICATION_CONFIDENCE = 0.5;
const OVERRIDE_LIST_PAGE_SIZE = 1000;
const SUPPORTED_OVERRIDE_ACTIONS = new Set(["mark-present"]);
const MAX_CRAFT_ANALYSIS_INPUT_CHARS = 500_000;
const MAX_CRAFT_ANALYSIS_SCENES = 120;
const MAX_CONSECUTIVE_CLASSIFIER_FAILURES = 2;
const MAX_CRAFT_ANALYSIS_DURATION_MS = 30_000;
const MAX_CRAFT_SCENE_CLASSIFICATION_MS = 12_000;

let configuredDeps = null;

function configureCraftAnalysis(deps = {}) {
  configuredDeps = {
    persistence: deps.persistence || null,
    classifier: deps.classifier || null,
  };
}

function craftAnalysisDeps() {
  if (!configuredDeps || !configuredDeps.persistence) {
    configuredDeps = {
      persistence: createPersistence(),
      classifier: configuredDeps?.classifier || null,
    };
  }
  return configuredDeps;
}

function reportStorageKey({ projectId, versionId }) {
  const proj = String(projectId || "").trim();
  const ver = String(versionId || "").trim();
  if (!proj) return null;
  return `${proj}:${ver}`;
}

async function getStoredReport({ storageProjectId, projectId, versionId }) {
  const key = reportStorageKey({ projectId: storageProjectId || projectId, versionId });
  if (!key) return null;
  const { persistence } = craftAnalysisDeps();
  return persistence.get({ domain: REPORTS_DOMAIN, key });
}

async function storeReport(report, { storageProjectId = null } = {}) {
  const key = reportStorageKey({
    projectId: storageProjectId || report?.projectId,
    versionId: report?.versionId,
  });
  if (!key) {
    const err = new Error("report.projectId is required");
    err.code = "craft_invalid_screenplay";
    throw err;
  }
  const validation = validateAgainstSchema(report, REPORT_SCHEMA);
  if (!validation.valid) {
    const err = new Error(`generated report failed schema validation: ${validation.errors.join("; ")}`);
    err.code = "craft_invalid_report";
    err.validationErrors = validation.errors;
    throw err;
  }
  const { persistence } = craftAnalysisDeps();
  await persistence.put({ domain: REPORTS_DOMAIN, key, value: report });
}

function midPage(range) {
  if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) return null;
  return Math.round((range.start + range.end) / 2);
}

function pageDrift(page, expectedRange) {
  if (!Number.isInteger(page) || !expectedRange) return null;
  if (page < expectedRange.start) return page - expectedRange.start;
  if (page > expectedRange.end) return page - expectedRange.end;
  return 0;
}

function driftStatus(driftPages) {
  if (!Number.isInteger(driftPages)) return "unavailable";
  if (driftPages < 0) return "early";
  if (driftPages > 0) return "late";
  return "on-target";
}

function timelineStatus(turn) {
  if (turn?.status === "missing") return "missing";
  if (turn?.status === "unavailable") return "unavailable";
  if (turn?.status === "manually_present") return "overridden";
  return driftStatus(turn?.driftPages);
}

function evidenceForScene({ scene, result, evidenceIndex }) {
  return {
    id: `ev_pending_${evidenceIndex}`,
    sceneId: scene.id,
    sceneTitle: scene.title,
    page: scene.pageStart,
    lineStart: scene.lineStart,
    lineEnd: scene.lineEnd,
    excerpt: excerptText(scene.text),
    confidence: result.confidence,
  };
}

function compareEvidence(a, b) {
  const confidence = Number(b.confidence || 0) - Number(a.confidence || 0);
  if (confidence !== 0) return confidence;
  const page = Number(a.page || 0) - Number(b.page || 0);
  if (page !== 0) return page;
  return String(a.id).localeCompare(String(b.id));
}

function isExpired(override, now) {
  if (!override?.expiresAt) return false;
  const expires = Date.parse(override.expiresAt);
  return Number.isFinite(expires) && expires <= now.getTime();
}

function activeOverridesByTurn(overrides, { projectId, versionId, frameworkId, now }) {
  const expectedVersion = String(versionId || "");
  const matching = (Array.isArray(overrides) ? overrides : []).filter((override) => (
    override
    && override.projectId === projectId
    && String(override.versionId || "") === expectedVersion
    && override.frameworkId === frameworkId
    && SUPPORTED_OVERRIDE_ACTIONS.has(override.action)
    && !isExpired(override, now)
  ));
  matching.sort((a, b) => {
    const created = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    return created || String(a.id || "").localeCompare(String(b.id || ""));
  });
  const byTurn = new Map();
  for (const override of matching) byTurn.set(override.turnId, override);
  return byTurn;
}

function craftAnalysisError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function validateAnalysisInput(screenplay) {
  let serialized = "";
  try {
    serialized = JSON.stringify(screenplay || {});
  } catch (_error) {
    throw craftAnalysisError("screenplay must be JSON-serializable", "craft_invalid_screenplay");
  }
  if (serialized.length > MAX_CRAFT_ANALYSIS_INPUT_CHARS) {
    throw craftAnalysisError(
      `screenplay exceeds the ${MAX_CRAFT_ANALYSIS_INPUT_CHARS} character analysis limit`,
      "craft_analysis_input_too_large",
    );
  }
}

async function classifySceneWithin({ classifier, framework, scene, timeoutMs }) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(craftAnalysisError(
      `craft scene classification timed out after ${timeoutMs}ms`,
      "craft_classifier_timeout",
    )), timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => classifier.classifyScene({ framework, scene })),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function classifyScenes({ classifier, framework, scenes }) {
  const evidenceByBeatId = new Map();
  let unavailableCount = 0;
  let classifiedCount = 0;
  const validBeatIds = new Set(framework.beats.map((beat) => beat.id));
  const classificationSource = classifier?.kind || "unavailable";

  if (!classifier || typeof classifier.classifyScene !== "function") {
    return { evidenceByBeatId, unavailableCount: scenes.length || 1, classifiedCount, classificationSource };
  }

  let evidenceIndex = 0;
  let consecutiveFailures = 0;
  const startedAt = Date.now();
  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
    const scene = scenes[sceneIndex];
    const remainingDurationMs = MAX_CRAFT_ANALYSIS_DURATION_MS - (Date.now() - startedAt);
    if (remainingDurationMs <= 0) {
      unavailableCount += scenes.length - sceneIndex;
      break;
    }
    let result;
    try {
      result = await classifySceneWithin({
        classifier,
        framework,
        scene,
        timeoutMs: Math.min(MAX_CRAFT_SCENE_CLASSIFICATION_MS, remainingDurationMs),
      });
    } catch (_error) {
      unavailableCount += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_CLASSIFIER_FAILURES) {
        unavailableCount += scenes.length - sceneIndex - 1;
        break;
      }
      continue;
    }
    if (!result || result.status === "unavailable" || result.status === "error") {
      unavailableCount += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_CLASSIFIER_FAILURES) {
        unavailableCount += scenes.length - sceneIndex - 1;
        break;
      }
      continue;
    }
    const beatId = typeof result.beatId === "string" && result.beatId.trim()
      ? result.beatId.trim()
      : null;
    if (beatId && !validBeatIds.has(beatId)) {
      unavailableCount += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_CLASSIFIER_FAILURES) {
        unavailableCount += scenes.length - sceneIndex - 1;
        break;
      }
      continue;
    }
    consecutiveFailures = 0;
    classifiedCount += 1;
    const confidence = typeof result.confidence === "number"
      ? Math.max(0, Math.min(1, result.confidence))
      : 0;
    if (!beatId || confidence < MIN_CLASSIFICATION_CONFIDENCE) continue;
    evidenceIndex += 1;
    const evidence = evidenceForScene({ scene, result: { ...result, confidence }, evidenceIndex });
    const existing = evidenceByBeatId.get(beatId) || [];
    existing.push({ ...evidence, classificationSource: result.source || classificationSource });
    evidenceByBeatId.set(beatId, existing);
  }
  return { evidenceByBeatId, unavailableCount, classifiedCount, classificationSource };
}

function publicEvidence(evidence, reportId, beatId) {
  return evidence.map(({ classificationSource: _source, ...item }, index) => ({
    ...item,
    id: `ev_${beatId}_${reportId}_${index + 1}`,
  }));
}

async function analyzeScreenplay({
  screenplay = {},
  frameworkId,
  projectId,
  versionId,
  generatedAt = null,
  classifier = null,
  overrides = [],
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
  validateAnalysisInput(screenplay);
  const scenes = parseScreenplayToScenes(screenplay);
  if (scenes.length > MAX_CRAFT_ANALYSIS_SCENES) {
    throw craftAnalysisError(
      `screenplay has ${scenes.length} scenes; the analysis limit is ${MAX_CRAFT_ANALYSIS_SCENES}`,
      "craft_analysis_scene_limit_exceeded",
    );
  }
  const pageCount = Number.isInteger(screenplay.pageCount) && screenplay.pageCount > 0
    ? screenplay.pageCount
    : Math.max(1, ...scenes.map((scene) => scene.pageEnd || 1));
  const generated = generatedAt || new Date().toISOString();
  const generatedDate = new Date(generated);
  const now = Number.isNaN(generatedDate.getTime()) ? new Date() : generatedDate;
  const reportId = `report_${projectId}_${versionId || "v"}_${Date.now().toString(36)}`;
  const selectedClassifier = classifier || craftAnalysisDeps().classifier || createDefaultClassifier();
  const classified = await classifyScenes({ classifier: selectedClassifier, framework, scenes });
  const hasUnresolvedScenes = scenes.length === 0 || classified.unavailableCount > 0;
  const activeOverrideMap = activeOverridesByTurn(overrides, { projectId, versionId, frameworkId, now });

  const beats = framework.beats.map((beatDef) => {
    const rawEvidence = (classified.evidenceByBeatId.get(beatDef.id) || []).sort(compareEvidence);
    const evidence = publicEvidence(rawEvidence, reportId, beatDef.id);
    const writerOverride = beatDef.majorTurnId ? activeOverrideMap.get(beatDef.majorTurnId) : null;
    const beat = {
      id: `b_${beatDef.id}_${reportId}`,
      frameworkBeatId: beatDef.id,
      label: beatDef.label,
      status: evidence.length > 0
        ? "present"
        : writerOverride ? "manually_present"
        : hasUnresolvedScenes ? "unavailable" : beatDef.required ? "missing" : "unclassified",
      classificationSource: rawEvidence[0]?.classificationSource
        || (writerOverride ? "writer-override" : classified.classificationSource),
      evidence,
    };
    if (beatDef.summary) beat.summary = beatDef.summary;
    if (beatDef.expectedPageRange) beat.expectedPageRange = { ...beatDef.expectedPageRange };
    if (beatDef.majorTurnId) beat.majorTurnId = beatDef.majorTurnId;
    if (evidence.length > 0) {
      const primary = evidence[0];
      beat.actualPageRange = { start: primary.page, end: primary.page };
      beat.sceneId = primary.sceneId;
      beat.sceneTitle = primary.sceneTitle;
      beat.confidence = primary.confidence;
    } else if (writerOverride && Number.isInteger(writerOverride.page)) {
      beat.actualPageRange = { start: writerOverride.page, end: writerOverride.page };
    } else if (beat.status === "unavailable") {
      beat.confidence = 0;
    }
    return beat;
  });

  const beatById = new Map(beats.map((beat) => [beat.frameworkBeatId, beat]));
  const requiredMajorTurnDefs = framework.beats.filter((beat) => beat.required && beat.majorTurnId);
  const majorTurns = requiredMajorTurnDefs.map((beatDef) => {
    const beat = beatById.get(beatDef.id);
    const detected = beat.evidence.length > 0;
    const override = activeOverrideMap.get(beatDef.majorTurnId);
    const manuallyPresent = !detected && Boolean(override);
    const turn = {
      id: `mt_${beatDef.majorTurnId}_${reportId}`,
      turnId: beatDef.majorTurnId,
      label: beatDef.label,
      required: true,
      status: detected ? "present" : manuallyPresent ? "manually_present" : hasUnresolvedScenes ? "unavailable" : "missing",
      detected,
      evidence: beat.evidence,
    };
    const expectedPage = midPage(beatDef.expectedPageRange);
    if (expectedPage !== null) turn.expectedPage = expectedPage;
    if (beatDef.expectedPageRange) turn.expectedPageRange = { ...beatDef.expectedPageRange };

    const primaryEvidence = beat.evidence[0];
    const actualPage = detected ? primaryEvidence?.page : manuallyPresent ? override.page : null;
    if (Number.isInteger(actualPage)) {
      turn.actualPage = actualPage;
      turn.actualPageRange = { start: actualPage, end: actualPage };
      turn.driftPages = pageDrift(actualPage, beatDef.expectedPageRange);
    }
    if (detected) {
      turn.sceneId = primaryEvidence.sceneId;
      turn.sceneTitle = primaryEvidence.sceneTitle;
      turn.confidence = primaryEvidence.confidence;
    } else {
      turn.confidence = 0;
    }
    if (manuallyPresent) turn.override = override;
    return turn;
  });

  const detectedMajorTurnCount = majorTurns.filter((turn) => turn.detected).length;
  const overriddenMajorTurnCount = majorTurns.filter((turn) => turn.status === "manually_present").length;
  const missingMajorTurnCount = majorTurns.filter((turn) => turn.status === "missing").length;
  const unavailableMajorTurnCount = majorTurns.filter((turn) => turn.status === "unavailable").length;
  const complete = detectedMajorTurnCount + overriddenMajorTurnCount === majorTurns.length;
  const confidenceValues = majorTurns.filter((turn) => turn.detected).map((turn) => Number(turn.confidence || 0));
  const confidence = complete && confidenceValues.length === 0
    ? 1
    : confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0;

  const timeline = majorTurns.map((turn) => {
    const item = {
      id: `td_${turn.turnId}_${reportId}`,
      turnId: turn.turnId,
      label: turn.label,
      status: timelineStatus(turn),
    };
    if (turn.expectedPage) item.expectedPage = turn.expectedPage;
    if (turn.actualPage) item.actualPage = turn.actualPage;
    if (Number.isInteger(turn.driftPages)) item.driftPages = turn.driftPages;
    return item;
  });
  const timed = timeline.filter((item) => Number.isInteger(item.driftPages));
  const missingTimelineCount = timeline.filter((item) => item.status === "missing").length;
  const unavailableTimelineCount = timeline.filter((item) => item.status === "unavailable").length;
  const overriddenTimelineCount = timeline.filter((item) => item.status === "overridden").length;
  const untimedOverrideCount = timeline.filter(
    (item) => item.status === "overridden" && !Number.isInteger(item.driftPages),
  ).length;
  const anyDrift = timed.some((item) => item.driftPages !== 0);
  let aggregateDriftStatus;
  let aggregateDriftSummary;
  if (unavailableTimelineCount > 0) {
    aggregateDriftStatus = unavailableTimelineCount === timeline.length ? "unavailable" : "partial";
    aggregateDriftSummary = `Analysis unavailable for ${unavailableTimelineCount} required turn${unavailableTimelineCount === 1 ? "" : "s"}; no missing-beat conclusion was inferred for those turns.`;
  } else if (missingTimelineCount > 0) {
    aggregateDriftStatus = "incomplete";
    aggregateDriftSummary = `Structural analysis incomplete: ${missingTimelineCount} required turn${missingTimelineCount === 1 ? " is" : "s are"} missing.`;
  } else if (untimedOverrideCount > 0) {
    aggregateDriftStatus = "partial";
    aggregateDriftSummary = `Structural coverage includes ${overriddenTimelineCount} writer-confirmed turn${overriddenTimelineCount === 1 ? "" : "s"}; timing is unavailable for ${untimedOverrideCount}.`;
  } else if (anyDrift) {
    aggregateDriftStatus = overriddenTimelineCount > 0 ? "drifted-with-overrides" : "drifted";
    aggregateDriftSummary = "One or more semantically identified major turns fall outside the expected page range.";
  } else {
    aggregateDriftStatus = overriddenTimelineCount > 0 ? "on-target-with-overrides" : "on-target";
    aggregateDriftSummary = overriddenTimelineCount > 0
      ? `All timed required turns fall within their expected page ranges; ${overriddenTimelineCount} turn${overriddenTimelineCount === 1 ? " was" : "s were"} writer-confirmed.`
      : "All semantically identified major turns fall within their expected page ranges.";
  }
  const drift = {
    status: aggregateDriftStatus,
    summary: aggregateDriftSummary,
    timeline,
  };

  const appliedOverrides = majorTurns.map((turn) => turn.override).filter(Boolean);
  const coverage = {
    requiredMajorTurnCount: majorTurns.length,
    detectedMajorTurnCount,
    overriddenMajorTurnCount,
    missingMajorTurnCount,
    unavailableMajorTurnCount,
    complete,
    confidence,
  };
  const report = {
    id: reportId,
    schemaVersion: CRAFT_SCHEMA_VERSION,
    projectId,
    framework: { id: framework.id, title: framework.title, version: framework.version },
    pageCount,
    coverage,
    beatSheet: {
      id: `beats_${projectId}_${versionId || "v"}`,
      frameworkId: framework.id,
      title: `${framework.title} — ${screenplay.title || projectId}`,
      beats,
    },
    majorTurns,
    drift,
    overrides: appliedOverrides,
    generatedAt: generated,
    generatedBy: `craft-analysis@2.0:${selectedClassifier?.kind || "unknown"}`,
    summary: complete
      ? `Structural coverage complete: ${detectedMajorTurnCount} detected, ${overriddenMajorTurnCount} writer-confirmed.`
      : unavailableMajorTurnCount > 0
        ? `Analysis unavailable or partial: ${unavailableMajorTurnCount} required turn${unavailableMajorTurnCount === 1 ? "" : "s"} lack complete classifier evidence.`
        : `Structural analysis incomplete: ${missingMajorTurnCount} required turn${missingMajorTurnCount === 1 ? "" : "s"} not found.`,
  };
  if (versionId) report.versionId = versionId;
  if (screenplay.title) report.screenplayTitle = screenplay.title;

  const validation = validateAgainstSchema(report, REPORT_SCHEMA);
  if (!validation.valid) {
    const err = new Error(`generated report failed schema validation: ${validation.errors.join("; ")}`);
    err.code = "craft_invalid_report";
    err.validationErrors = validation.errors;
    throw err;
  }
  return report;
}

function nextOverrideId() {
  return `ov_${randomUUID()}`;
}

function requireNonemptyString(value, field) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized) return normalized;
  const err = new Error(`${field} is required`);
  err.code = "craft_invalid_screenplay";
  throw err;
}

async function recordOverride({ override, requestingUserId }) {
  if (!override || typeof override !== "object") {
    const err = new Error("override body required");
    err.code = "craft_invalid_screenplay";
    throw err;
  }
  const turnId = requireNonemptyString(override.turnId, "override.turnId");
  const action = requireNonemptyString(override.action, "override.action");
  const projectId = requireNonemptyString(override.projectId, "override.projectId");
  const frameworkId = requireNonemptyString(override.frameworkId, "override.frameworkId");
  if (!SUPPORTED_OVERRIDE_ACTIONS.has(action)) {
    const err = new Error(`unsupported override.action: ${action}`);
    err.code = "craft_invalid_screenplay";
    throw err;
  }
  const framework = getFrameworkById(frameworkId);
  if (!framework || !framework.requiredMajorTurnIds.includes(turnId)) {
    const err = new Error(`override.turnId is not a required turn in ${frameworkId}`);
    err.code = "craft_invalid_screenplay";
    throw err;
  }
  if (requestingUserId && override.userId && override.userId !== requestingUserId) {
    const err = new Error("override.userId must match authenticated user");
    err.code = "craft_override_user_mismatch";
    throw err;
  }
  if (!requestingUserId) {
    const err = new Error("authenticated user is required");
    err.code = "craft_override_user_mismatch";
    throw err;
  }
  const id = nextOverrideId();
  const stored = {
    id,
    projectId,
    frameworkId,
    turnId,
    action,
    userId: requestingUserId,
    createdAt: new Date().toISOString(),
  };
  if (typeof override.versionId === "string" && override.versionId.trim()) stored.versionId = override.versionId.trim();
  if (typeof override.reason === "string" && override.reason.trim()) stored.reason = override.reason.trim();
  if (typeof override.sceneId === "string" && override.sceneId.trim()) stored.sceneId = override.sceneId.trim();
  if (Number.isInteger(override.page) && override.page > 0) stored.page = override.page;
  if (typeof override.expiresAt === "string" && override.expiresAt.trim()) stored.expiresAt = override.expiresAt.trim();
  const { persistence } = craftAnalysisDeps();
  await persistence.put({ domain: OVERRIDES_DOMAIN, key: id, value: stored });
  return stored;
}

async function listOverrides({ userId, projectId, versionId, frameworkId }) {
  const expectedUserId = requireNonemptyString(userId, "userId");
  const expectedProjectId = requireNonemptyString(projectId, "projectId");
  const expectedFrameworkId = requireNonemptyString(frameworkId, "frameworkId");
  const expectedVersionId = String(versionId || "");
  const { persistence } = craftAnalysisDeps();
  const matches = [];
  let afterKey = "";
  while (true) {
    const page = await persistence.list({ domain: OVERRIDES_DOMAIN, afterKey, limit: OVERRIDE_LIST_PAGE_SIZE });
    for (const row of page) {
      const value = row?.value;
      if (
        value?.userId === expectedUserId
        && value?.projectId === expectedProjectId
        && String(value?.versionId || "") === expectedVersionId
        && value?.frameworkId === expectedFrameworkId
      ) matches.push(value);
    }
    if (page.length < OVERRIDE_LIST_PAGE_SIZE) break;
    afterKey = page[page.length - 1]?.key || "";
    if (!afterKey) break;
  }
  return matches;
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

function _resetCraftStores() {
  configuredDeps = null;
}

export {
  analyzeScreenplay,
  storeReport,
  getStoredReport,
  recordOverride,
  listOverrides,
  deleteOverride,
  getOverride,
  configureCraftAnalysis,
  _resetCraftStores,
  REPORTS_DOMAIN,
  OVERRIDES_DOMAIN,
  MIN_CLASSIFICATION_CONFIDENCE,
  MAX_CONSECUTIVE_CLASSIFIER_FAILURES,
  MAX_CRAFT_ANALYSIS_DURATION_MS,
  MAX_CRAFT_ANALYSIS_INPUT_CHARS,
  MAX_CRAFT_ANALYSIS_SCENES,
  MAX_CRAFT_SCENE_CLASSIFICATION_MS,
};
