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
import {
  buildCraftCardCitations,
  buildFormattingLintWarnings,
  buildGenreDoctorPasses,
  buildScreenwritingCraftNoteAnchors,
  filterScreenwritingCards,
} from "./screenwriting_knowledge.js";

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

function screenplayDraftText(screenplay = {}) {
  return String(screenplay.text || screenplay.draft || screenplay.fountain || "");
}

const TURN_KEYWORDS = Object.freeze({
  "catalyst": ["catalyst", "inciting incident", "inciting", "disruption"],
  "inciting-incident": ["inciting incident", "inciting", "call to adventure", "disruption"],
  "midpoint": ["midpoint", "false victory", "false defeat", "reversal"],
  "midpoint-twist": ["midpoint", "midpoint twist", "reversal", "false victory", "false defeat"],
  "all-is-lost": ["all is lost", "lowest moment", "low point", "death and rebirth", "collapse"],
  "finale": ["finale", "climax", "final confrontation", "showdown"],
  "climax": ["climax", "finale", "final confrontation", "showdown", "resurrection"],
});

function pageMarkerBefore(lines, index, fallbackPage) {
  for (let i = index; i >= 0; i -= 1) {
    const line = String(lines[i] || "");
    const m = line.match(/\[\[\s*PAGE\s+(\d{1,3})\s*\]\]|\b(?:PAGE|P)\s*(\d{1,3})\b/i);
    if (m) {
      const page = Number(m[1] || m[2] || 0);
      if (Number.isInteger(page) && page > 0) return page;
    }
  }
  return fallbackPage;
}

function detectTurnEvidence({ turnId, label, draftText, pageCount }) {
  const text = String(draftText || "");
  if (!text.trim()) return null;
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const keywords = TURN_KEYWORDS[turnId] || TURN_KEYWORDS[String(label || "").toLowerCase()] || [String(label || turnId || "").toLowerCase()];
  for (let i = 0; i < lines.length; i += 1) {
    const haystack = String(lines[i] || "").toLowerCase();
    if (!keywords.some((kw) => kw && haystack.includes(kw))) continue;
    const fallbackPage = Math.max(1, Math.min(pageCount, Math.ceil((i + 1) / 55)));
    const page = Math.max(1, Math.min(pageCount, pageMarkerBefore(lines, i, fallbackPage)));
    return {
      page,
      line: i + 1,
      excerpt: String(lines[i] || "").trim().slice(0, 220) || String(label || "turn") + " marker",
    };
  }
  return null;
}

function statusFromDrift(drift) {
  if (!Number.isFinite(drift)) return "present";
  if (Math.abs(drift) <= 3) return "on-target";
  return drift > 0 ? "late" : "early";
}

// Pure: produce a Report from a framework + screenplay info.
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
  const draftText = screenplayDraftText(screenplay);

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
    const evidence = detectTurnEvidence({
      turnId: beatDef.majorTurnId,
      label: beatDef.label,
      draftText,
      pageCount,
    });
    const actualPage = evidence?.page || expectedPage;
    if (actualPage !== null) turn.actualPage = actualPage;
    if (actualPage !== null) turn.actualPageRange = { start: actualPage, end: actualPage };
    if (expectedPage !== null && actualPage !== null) turn.driftPages = actualPage - expectedPage;
    turn.status = statusFromDrift(turn.driftPages);
    turn.confidence = evidence ? 0.68 : 0.5;
    if (evidence) {
      turn.evidence = [{
        id: `ev_${beatDef.majorTurnId}_${reportId}`,
        page: evidence.page,
        lineStart: evidence.line,
        lineEnd: evidence.line,
        excerpt: evidence.excerpt,
        confidence: 0.68,
      }];
    }
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
      const turn = beatDef.majorTurnId
        ? majorTurns.find((mt) => mt.turnId === beatDef.majorTurnId)
        : null;
      beat.actualPageRange = turn?.actualPageRange ? { ...turn.actualPageRange } : { ...beatDef.expectedPageRange };
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

  const driftingTurns = majorTurns.filter((mt) => Number.isFinite(mt.driftPages) && Math.abs(mt.driftPages) > 3);
  const drift = {
    status: driftingTurns.length ? "drifting" : "on-target",
    summary: driftingTurns.length
      ? driftingTurns.map((mt) => `${mt.label} lands on page ${mt.actualPage}, ${Math.abs(mt.driftPages)} page(s) ${mt.driftPages > 0 ? "late" : "early"}.`).join(" ")
      : "Required major turns are within the expected page windows.",
    timeline: majorTurns.map((mt) => ({
      id: `td_${mt.turnId}_${reportId}`,
      turnId: mt.turnId,
      label: mt.label,
      expectedPage: mt.expectedPage,
      actualPage: mt.actualPage,
      driftPages: mt.driftPages,
      status: statusFromDrift(mt.driftPages),
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
  report.generatedBy = "craft-analysis-rule-runtime@1.1";
  report.summary = drift.summary;
  const craftCards = filterScreenwritingCards({
    craftArea: screenplay.craftArea || screenplay.area || "",
    genre: screenplay.genre || "",
    q: draftText || screenplay.title || framework.title,
    limit: 10,
  }).cards;
  report.citationSources = buildCraftCardCitations(craftCards, 6);
  report.craftNotes = buildScreenwritingCraftNoteAnchors({
    draft: draftText,
    cards: craftCards,
    craftArea: screenplay.craftArea || "",
    genre: screenplay.genre || "",
    maxNotes: 8,
  });
  report.formattingWarnings = buildFormattingLintWarnings({
    draft: draftText,
    format: screenplay.format || "fountain",
    cards: craftCards,
    maxWarnings: 8,
  });
  report.genreDoctorPasses = buildGenreDoctorPasses({
    genre: screenplay.genre || "drama",
    draft: draftText,
    cards: craftCards,
    maxPasses: 3,
  });

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
