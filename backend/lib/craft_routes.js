// Craft routes — mounts /craft/* endpoints onto an Express app.
// All handlers return typed envelopes and the schema-versioned shapes
// documented in docs/T18-craft-schemas-and-analysis.md.

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

function requestingUserIdFor(req) {
  // The existing auth middleware sets req.user.id when an authenticated
  // user resolves. Read defensively — public/unauthenticated requests
  // are allowed for read endpoints; mutations enforce userId match
  // when a user is present.
  return req?.user?.id || null;
}

function mountCraftRoutes(app) {
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
    let report;
    try {
      report = await getStoredReport({
        projectId: req.params.projectId,
        versionId: req.params.versionId,
      });
    } catch (e) {
      return sendKnownError(res, "craft_report_not_found", e?.message || "report not found");
    }
    if (!report) return sendKnownError(res, "craft_report_not_found");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(report);
  });

  app.post("/craft/analyze", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    try {
      const report = analyzeScreenplay({
        screenplay: body.screenplay || {},
        frameworkId: body.frameworkId,
        projectId: body.projectId,
        versionId: body.versionId,
      });
      await storeReport(report);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(report);
    } catch (e) {
      if (e?.code) return sendKnownError(res, e.code, e.message);
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "analysis failed");
    }
  });

  app.post("/craft/overrides", async (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    try {
      const stored = await recordOverride({
        override: req.body || {},
        requestingUserId: requestingUserIdFor(req),
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
    const requesting = requestingUserIdFor(req);
    if (requesting && existing.userId && existing.userId !== requesting) {
      return sendKnownError(
        res,
        "craft_override_user_mismatch",
        "only the owning user may delete this override",
      );
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
    const { persistence, classifier } = loglineDistillerDeps();
    try {
      const logline = await distillLogline({ text, frameworkId, classifier });
      const source = classifier?.kind === "openai" ? "openai" : "stub";
      if (persistence) {
        const entry = await recordLogline({
          persistence, projectId, versionId, logline, frameworkId, source,
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
    const { persistence } = loglineDistillerDeps();
    if (!persistence) return sendKnownError(res, "craft_invalid_screenplay", "persistence not configured");
    try {
      const drift = await computeDrift({ persistence, projectId, currentLogline });
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
    const { persistence } = loglineDistillerDeps();
    if (!persistence) return sendKnownError(res, "craft_invalid_screenplay", "persistence not configured");
    try {
      const entries = await getLoglineHistory({ persistence, projectId });
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
    const userId = typeof body.userId === "string"
      ? body.userId
      : (req?.user?.id || null);
    const sceneId = typeof body.sceneId === "string" ? body.sceneId : null;
    const note = typeof body.note === "string" ? body.note : null;
    if (!projectId) return sendKnownError(res, "craft_invalid_screenplay", "projectId is required");
    const { persistence } = acceptedTwistLogDeps();
    if (!persistence) return sendKnownError(res, "craft_invalid_screenplay", "persistence not configured");
    try {
      const result = await recordAcceptedTwist({
        persistence, projectId, versionId, frameworkId, beatId, twist, userId, sceneId, note,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ schemaVersion: 1, ...result });
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
    const { persistence } = acceptedTwistLogDeps();
    if (!persistence) return sendKnownError(res, "craft_invalid_screenplay", "persistence not configured");
    try {
      const entries = await getAcceptedTwistsForProject({ persistence, projectId });
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
    const { persistence } = acceptedTwistLogDeps();
    if (!persistence) return sendKnownError(res, "craft_invalid_screenplay", "persistence not configured");
    try {
      const result = await removeAcceptedTwist({ persistence, projectId, versionId, twistId });
      if (!result.ok) return sendKnownError(res, "craft_invalid_screenplay", "twist not found");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ schemaVersion: 1, ...result });
    } catch (e) {
      if (e?.code) return sendKnownError(res, "craft_invalid_screenplay", e.message);
      return sendKnownError(res, "craft_invalid_screenplay", e?.message || "delete failed");
    }
  });
}

export { mountCraftRoutes };
