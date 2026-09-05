// Craft routes — mounts /craft/* endpoints onto an Express app.
// All handlers return typed envelopes and the schema-versioned shapes
// documented in docs/T18-craft-schemas-and-analysis.md.

import express from "express";
import {
  listFrameworkReferences,
  getFrameworkById,
  serializeFramework,
} from "./craft_frameworks.js";
import {
  CRAFT_SCHEMA_VERSION,
  FRAMEWORK_SCHEMA,
  REPORT_SCHEMA,
} from "./craft_schemas.js";
import {
  analyzeScreenplay,
  storeReport,
  getStoredReport,
  recordOverride,
  deleteOverride,
  getOverride,
} from "./craft_analysis.js";
import { lintScreenplay } from "./format_linter.js";
import { suggestTwists } from "./twist_engine.js";
import { simulateCoverage } from "./coverage_simulator.js";
import { trackPayoffs } from "./payoff_tracker.js";
import { classifyGenre } from "./genre_classifier.js";
import {
  distillLogline,
  recordLogline,
  getLoglineHistory,
  computeDrift,
  loglineDistillerDeps,
} from "./logline_distiller.js";
import {
  recordAcceptedTwist,
  getAcceptedTwistsForProject,
  removeAcceptedTwist,
  acceptedTwistLogDeps,
} from "./accepted_twist_log.js";

// Craft is fail-closed. Only immutable framework/schema metadata is public;
// every other current or future /craft route requires canonical user auth.
// Keep this allowlist deliberately method-aware so a future mutation mounted
// below a public-looking path cannot inherit public access by accident.
const PUBLIC_CRAFT_ROUTE_PATTERNS = Object.freeze([
  Object.freeze({ method: "GET", pattern: /^\/frameworks\/?$/ }),
  Object.freeze({ method: "GET", pattern: /^\/frameworks\/[^/]+\/?$/ }),
  Object.freeze({ method: "GET", pattern: /^\/schemas\/(?:report|framework)\/?$/ }),
]);

function isPublicCraftRoute(method, pathname) {
  const normalizedMethod = String(method || "").trim().toUpperCase();
  const normalizedPath = String(pathname || "").split("?", 1)[0] || "/";
  return PUBLIC_CRAFT_ROUTE_PATTERNS.some(({ method: allowedMethod, pattern }) => (
    allowedMethod === normalizedMethod && pattern.test(normalizedPath)
  ));
}

function canonicalAuthenticatedUserId(req) {
  return String(req?.authUser?.id || req?.userId || "").trim();
}

function craftStorageProjectId(userId, projectId) {
  const userNamespace = Buffer.from(String(userId || ""), "utf8").toString("base64url");
  const projectNamespace = Buffer.from(String(projectId || ""), "utf8").toString("base64url");
  return `user.${userNamespace}.project.${projectNamespace}`;
}

function errorEnvelope(error, message) {
  const out = { error };
  if (message) out.message = message;
  return out;
}

function errorCodeToStatus(code) {
  switch (code) {
    case "craft_framework_not_found":
    case "craft_report_not_found":
    case "craft_override_not_found":
      return 404;
    case "craft_invalid_framework_id":
    case "craft_invalid_screenplay":
    case "craft_schema_version_unsupported":
      return 400;
    case "craft_override_user_mismatch":
      return 403;
    default:
      return 500;
  }
}

function sendKnownError(res, error, message) {
  return res.status(errorCodeToStatus(error)).json(errorEnvelope(error, message));
}

function readClientSchemaVersionHeader(req) {
  const raw = req.headers?.["x-craft-schema-version"];
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return NaN;
  return n;
}

function checkClientSchemaVersion(req, res) {
  const v = readClientSchemaVersionHeader(req);
  if (v === null) return true; // header not provided; accept
  if (Number.isNaN(v) || v > CRAFT_SCHEMA_VERSION) {
    sendKnownError(
      res,
      "craft_schema_version_unsupported",
      `server supports schemaVersion ${CRAFT_SCHEMA_VERSION}; client requested ${req.headers["x-craft-schema-version"]}`,
    );
    return false;
  }
  return true;
}

function mountCraftRoutes(app, deps = {}) {
  const {
    requireAuthenticatedUser = (req, res, stage = "craft_auth") => {
      const userId = canonicalAuthenticatedUserId(req);
      if (userId) return req.authUser || { id: userId };
      res.status(401).json({ stage, error: "user_auth_required" });
      return null;
    },
    getOrCreateScreenplayOwnerRecord = null,
    getScreenplayProjectRecord = null,
    // Explicit seam for focused route tests. Production intentionally uses
    // the screenplay owner store functions above.
    authorizeProjectAccess = null,
  } = deps;

  // Validate wiring before registering even the public routes. Keep the
  // canonical-identity auth default for focused mounts, but never let absent
  // ownership dependencies masquerade as a project-not-found response.
  if (typeof requireAuthenticatedUser !== "function") {
    throw new Error("mountCraftRoutes: requireAuthenticatedUser is required and must be a function");
  }
  if (authorizeProjectAccess !== null && typeof authorizeProjectAccess !== "function") {
    throw new Error("mountCraftRoutes: authorizeProjectAccess must be a function when provided");
  }
  if (authorizeProjectAccess === null) {
    const requiredOwnershipFns = { getOrCreateScreenplayOwnerRecord, getScreenplayProjectRecord };
    for (const [name, fn] of Object.entries(requiredOwnershipFns)) {
      if (typeof fn !== "function") {
        throw new Error(`mountCraftRoutes: ${name} is required when authorizeProjectAccess is not provided`);
      }
    }
  }

  app.use("/craft", (req, res, next) => {
    if (isPublicCraftRoute(req.method, req.path)) return next();
    const user = requireAuthenticatedUser(req, res, "craft_auth");
    if (!user) return undefined;
    const userId = String(user.id || canonicalAuthenticatedUserId(req)).trim();
    if (!userId) {
      return res.status(401).json({ stage: "craft_auth", error: "user_auth_required" });
    }
    // Normalize the trusted identity field used by screenplay ownership.
    // Request bodies and X-User-Id are never consulted.
    req.userId = userId;
    return next();
  });
  app.use("/craft", express.json({ limit: "2mb" }));

  async function requireOwnedProject(req, res, projectId) {
    const normalizedProjectId = String(projectId || "").trim();
    const userId = canonicalAuthenticatedUserId(req);
    if (!normalizedProjectId || !userId) {
      res.setHeader("Cache-Control", "no-store");
      res.status(404).json({ stage: "craft_project", error: "project_not_found" });
      return null;
    }

    let project = null;
    if (typeof authorizeProjectAccess === "function") {
      const authorized = await authorizeProjectAccess({ req, userId, projectId: normalizedProjectId });
      project = authorized === true ? { id: normalizedProjectId } : authorized;
    } else if (
      typeof getOrCreateScreenplayOwnerRecord === "function"
      && typeof getScreenplayProjectRecord === "function"
    ) {
      const owner = getOrCreateScreenplayOwnerRecord(req, { create: false });
      project = getScreenplayProjectRecord(owner, normalizedProjectId);
    }

    if (!project) {
      res.setHeader("Cache-Control", "no-store");
      res.status(404).json({ stage: "craft_project", error: "project_not_found" });
      return null;
    }
    return {
      project,
      projectId: normalizedProjectId,
      storageProjectId: craftStorageProjectId(userId, normalizedProjectId),
      userId,
    };
  }

  app.get("/craft/frameworks", (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      schemaVersion: CRAFT_SCHEMA_VERSION,
      frameworks: listFrameworkReferences(),
    });
  });

  app.get("/craft/frameworks/:frameworkId", (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const framework = getFrameworkById(req.params.frameworkId);
    if (!framework) {
      return sendKnownError(res, "craft_framework_not_found");
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(serializeFramework(framework));
  });

  app.get("/craft/schemas/report", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(REPORT_SCHEMA);
  });

  app.get("/craft/schemas/framework", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(FRAMEWORK_SCHEMA);
  });

  app.get("/craft/reports/:projectId/:versionId?", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const owned = await requireOwnedProject(req, res, req.params.projectId);
    if (!owned) return;
    let report;
    try {
      report = await getStoredReport({
        projectId: owned.storageProjectId,
        versionId: req.params.versionId,
      });
    } catch (e) {
      return sendKnownError(res, "craft_report_not_found", e?.message || "report not found");
    }
    if (!report) return sendKnownError(res, "craft_report_not_found");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ...report, projectId: owned.projectId });
  });

  app.post("/craft/analyze", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    if (typeof body.projectId !== "string" || !body.projectId.trim()) {
      return sendKnownError(res, "craft_invalid_screenplay", "screenplay.projectId is required");
    }
    const owned = await requireOwnedProject(req, res, body.projectId);
    if (!owned) return;
    try {
      const report = analyzeScreenplay({
        screenplay: body.screenplay || {},
        frameworkId: body.frameworkId,
        projectId: owned.projectId,
        versionId: body.versionId,
      });
      await storeReport({ ...report, projectId: owned.storageProjectId });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ...report, projectId: owned.projectId });
    } catch (e) {
      if (e?.code) return sendKnownError(res, e.code, e.message);
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "analysis failed");
    }
  });

  app.post("/craft/overrides", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    try {
      const stored = await recordOverride({
        override: { ...(req.body || {}), userId: canonicalAuthenticatedUserId(req) },
        requestingUserId: canonicalAuthenticatedUserId(req),
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(stored);
    } catch (e) {
      if (e?.code) return sendKnownError(res, e.code, e.message);
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "invalid override");
    }
  });

  app.delete("/craft/overrides/:overrideId", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const id = req.params.overrideId;
    const existing = await getOverride(id);
    if (!existing) return sendKnownError(res, "craft_override_not_found");
    const requesting = canonicalAuthenticatedUserId(req);
    if (!requesting || !existing.userId || existing.userId !== requesting) {
      // Match the screenplay IDOR posture: do not reveal whether another
      // user's object exists.
      return sendKnownError(res, "craft_override_not_found");
    }
    try {
      await deleteOverride(id);
    } catch (e) {
      if (e?.code) return sendKnownError(res, e.code, e.message);
      return sendKnownError(res, "craft_override_not_found", e?.message);
    }
    return res.status(200).json({ ok: true });
  });

  // T-format-linter: Hollywood format linter v1. Pure rule-based; no LLM.
  app.post("/craft/format/lint", (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    const text = typeof body.text === "string" ? body.text : "";
    const frameworkId = typeof body.frameworkId === "string" ? body.frameworkId : null;
    if (!text) {
      return sendKnownError(res, "craft_invalid_screenplay", "text is required");
    }
    try {
      const result = lintScreenplay({ text, frameworkId });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(result);
    } catch (e) {
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "lint failed");
    }
  });

  // T-coverage-simulator: pre-submission "what a reader sees" report.
  app.post("/craft/coverage/simulate", (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    const text = typeof body.text === "string" ? body.text : "";
    const pageCount = Number.isInteger(body.pageCount) ? body.pageCount : null;
    const frameworkId = typeof body.frameworkId === "string" ? body.frameworkId : null;
    if (!text) {
      return sendKnownError(res, "craft_invalid_screenplay", "text is required");
    }
    try {
      const result = simulateCoverage({ text, pageCount, frameworkId });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(result);
    } catch (e) {
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "coverage simulation failed");
    }
  });

  // T-payoff-tracker: detect setup → payoff pairs in screenplay text.
  app.post("/craft/payoff/track", (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    const text = typeof body.text === "string" ? body.text : "";
    const frameworkId = typeof body.frameworkId === "string" ? body.frameworkId : null;
    if (!text) {
      return sendKnownError(res, "craft_invalid_screenplay", "text is required");
    }
    try {
      const result = trackPayoffs({ text, frameworkId });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(result);
    } catch (e) {
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "payoff tracking failed");
    }
  });

  // T-genre-classifier: deterministic genre + tone classifier.
  app.post("/craft/genre/classify", (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    const text = typeof body.text === "string" ? body.text : "";
    const frameworkId = typeof body.frameworkId === "string" ? body.frameworkId : null;
    if (!text) {
      return sendKnownError(res, "craft_invalid_screenplay", "text is required");
    }
    try {
      const result = classifyGenre({ text, frameworkId });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(result);
    } catch (e) {
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "classify failed");
    }
  });

  // T-twist-engine: structured beat-aware reversal suggestions.
  app.post("/craft/twist/suggest", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    const frameworkId = typeof body.frameworkId === "string" ? body.frameworkId : "";
    const currentBeatId = typeof body.currentBeatId === "string" ? body.currentBeatId : "";
    const sceneSummary = typeof body.sceneSummary === "string" ? body.sceneSummary : "";
    const count = body.count;
    if (!frameworkId) return sendKnownError(res, "craft_invalid_framework_id", "frameworkId is required");
    if (!currentBeatId) return sendKnownError(res, "craft_invalid_screenplay", "currentBeatId is required");
    try {
      const result = await suggestTwists({ frameworkId, currentBeatId, sceneSummary, count });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(result);
    } catch (e) {
      if (e?.code === "twist_unknown_framework") {
        return sendKnownError(res, "craft_invalid_framework_id", e.message);
      }
      if (e?.code === "twist_unknown_beat") {
        return sendKnownError(res, "craft_invalid_screenplay", e.message);
      }
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "twist failed");
    }
  });

  // T-logline-distiller: extract + persist a one-sentence logline.
  app.post("/craft/logline/distill", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    const text = typeof body.text === "string" ? body.text : "";
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const versionId = typeof body.versionId === "string" ? body.versionId : null;
    const frameworkId = typeof body.frameworkId === "string" ? body.frameworkId : null;
    if (!text) return sendKnownError(res, "craft_invalid_screenplay", "text is required");
    if (!projectId) return sendKnownError(res, "craft_invalid_screenplay", "projectId is required");
    const owned = await requireOwnedProject(req, res, projectId);
    if (!owned) return;
    const { persistence, classifier } = loglineDistillerDeps();
    try {
      const logline = await distillLogline({ text, frameworkId, classifier });
      const source = classifier?.kind === "openai" ? "openai" : "stub";
      if (persistence) {
        const entry = await recordLogline({
          persistence, projectId: owned.storageProjectId, versionId, logline, frameworkId, source,
        });
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({
          schemaVersion: 1,
          logline: entry.logline,
          source: entry.source,
          distilledAt: entry.distilledAt,
          stored: true,
        });
      }
      // No persistence configured (defensive — should not happen in production).
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        schemaVersion: 1,
        logline,
        source,
        distilledAt: new Date().toISOString(),
        stored: false,
      });
    } catch (e) {
      if (e?.code) return sendKnownError(res, e.code, e.message);
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "logline distillation failed");
    }
  });

  // T-logline-distiller: drift signal between earliest and current/latest logline.
  app.get("/craft/logline/drift", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const projectId = typeof req.query?.projectId === "string" ? req.query.projectId : "";
    const currentLogline = typeof req.query?.currentLogline === "string"
      ? req.query.currentLogline
      : null;
    if (!projectId) return sendKnownError(res, "craft_invalid_screenplay", "projectId query param required");
    const owned = await requireOwnedProject(req, res, projectId);
    if (!owned) return;
    const { persistence } = loglineDistillerDeps();
    if (!persistence) return sendKnownError(res, "craft_invalid_screenplay", "persistence not configured");
    try {
      const drift = await computeDrift({ persistence, projectId: owned.storageProjectId, currentLogline });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ schemaVersion: 1, ...drift });
    } catch (e) {
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "drift failed");
    }
  });

  // T-logline-distiller: full logline history per project (for the iOS surface).
  app.get("/craft/logline/history", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const projectId = typeof req.query?.projectId === "string" ? req.query.projectId : "";
    if (!projectId) return sendKnownError(res, "craft_invalid_screenplay", "projectId query param required");
    const owned = await requireOwnedProject(req, res, projectId);
    if (!owned) return;
    const { persistence } = loglineDistillerDeps();
    if (!persistence) return sendKnownError(res, "craft_invalid_screenplay", "persistence not configured");
    try {
      const storedEntries = await getLoglineHistory({ persistence, projectId: owned.storageProjectId });
      const entries = storedEntries.map((entry) => ({ ...entry, projectId: owned.projectId }));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ schemaVersion: 1, projectId, entries });
    } catch (e) {
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "history failed");
    }
  });

  // T-accepted-twist-log: persist a twist the writer accepted so the
  // iOS twist-card consumer can re-load the timeline and the
  // prompt-assembly path can reference the chosen reversal.
  app.post("/craft/twist/accepted", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const versionId = typeof body.versionId === "string" ? body.versionId : null;
    const frameworkId = typeof body.frameworkId === "string" ? body.frameworkId : null;
    const beatId = typeof body.beatId === "string" ? body.beatId : null;
    const twist = body.twist;
    const userId = canonicalAuthenticatedUserId(req);
    const sceneId = typeof body.sceneId === "string" ? body.sceneId : null;
    const note = typeof body.note === "string" ? body.note : null;
    if (!projectId) return sendKnownError(res, "craft_invalid_screenplay", "projectId is required");
    const owned = await requireOwnedProject(req, res, projectId);
    if (!owned) return;
    const { persistence } = acceptedTwistLogDeps();
    if (!persistence) return sendKnownError(res, "craft_invalid_screenplay", "persistence not configured");
    try {
      const result = await recordAcceptedTwist({
        persistence,
        projectId: owned.storageProjectId,
        versionId,
        frameworkId,
        beatId,
        twist,
        userId,
        sceneId,
        note,
      });
      const entry = result?.entry ? { ...result.entry, projectId: owned.projectId } : result?.entry;
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ schemaVersion: 1, ...result, entry });
    } catch (e) {
      if (e?.code) return sendKnownError(res, "craft_invalid_screenplay", e.message);
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "accept failed");
    }
  });

  // T-accepted-twist-log: chronologically-ordered log for one project.
  app.get("/craft/twist/accepted", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const projectId = typeof req.query?.projectId === "string" ? req.query.projectId : "";
    if (!projectId) return sendKnownError(res, "craft_invalid_screenplay", "projectId query param required");
    const owned = await requireOwnedProject(req, res, projectId);
    if (!owned) return;
    const { persistence } = acceptedTwistLogDeps();
    if (!persistence) return sendKnownError(res, "craft_invalid_screenplay", "persistence not configured");
    try {
      const storedEntries = await getAcceptedTwistsForProject({
        persistence,
        projectId: owned.storageProjectId,
      });
      const entries = storedEntries.map((entry) => ({ ...entry, projectId: owned.projectId }));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ schemaVersion: 1, projectId, entries });
    } catch (e) {
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "fetch failed");
    }
  });

  // T-accepted-twist-log: un-accept a previously accepted twist.
  app.delete("/craft/twist/accepted/:twistId", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const twistId = req.params.twistId;
    const projectId = typeof req.query?.projectId === "string" ? req.query.projectId : "";
    const versionId = typeof req.query?.versionId === "string" ? req.query.versionId : null;
    if (!projectId) return sendKnownError(res, "craft_invalid_screenplay", "projectId query param required");
    const owned = await requireOwnedProject(req, res, projectId);
    if (!owned) return;
    const { persistence } = acceptedTwistLogDeps();
    if (!persistence) return sendKnownError(res, "craft_invalid_screenplay", "persistence not configured");
    try {
      const result = await removeAcceptedTwist({
        persistence,
        projectId: owned.storageProjectId,
        versionId,
        twistId,
      });
      if (!result.ok) return sendKnownError(res, "craft_invalid_screenplay", "twist not found");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ schemaVersion: 1, ...result });
    } catch (e) {
      if (e?.code) return sendKnownError(res, "craft_invalid_screenplay", e.message);
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "delete failed");
    }
  });
}

export {
  PUBLIC_CRAFT_ROUTE_PATTERNS,
  craftStorageProjectId,
  isPublicCraftRoute,
  mountCraftRoutes,
};
