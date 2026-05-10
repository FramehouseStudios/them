// Craft routes - mounts /craft/* endpoints onto an Express app.

import path from "node:path";
import { fileURLToPath } from "node:url";

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
import {
  buildCraftCardCitations,
  buildFormattingLintWarnings,
  buildGenreDoctorPasses,
  buildReleaseReadinessArtifact,
  buildScreenwritingCraftNoteAnchors,
  filterScreenwritingCards,
} from "./screenwriting_knowledge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CARDS_FILE = path.resolve(__dirname, "..", "knowledge_cards.json");
const DEFAULT_CACHE_FILE = path.resolve(__dirname, "..", "knowledge_embeddings_cache.json");

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
  if (v === null) return true;
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
  return req?.user?.id || null;
}

function draftFromBody(body) {
  return String(body?.draft ?? body?.text ?? body?.screenplay?.text ?? "");
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
    if (!framework) return sendKnownError(res, "craft_framework_not_found");
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

  app.get("/craft/knowledge/cards", (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const result = filterScreenwritingCards({
      cardsFile: DEFAULT_CARDS_FILE,
      craftArea: req.query?.craftArea || req.query?.area || "",
      genre: req.query?.genre || "",
      q: req.query?.q || "",
      limit: req.query?.limit || 12,
    });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      schemaVersion: CRAFT_SCHEMA_VERSION,
      ...result,
      citations: buildCraftCardCitations(result.cards, 6),
    });
  });

  app.get("/craft/knowledge/readiness", (_req, res) => {
    const artifact = buildReleaseReadinessArtifact({
      cardsFile: DEFAULT_CARDS_FILE,
      cacheFile: DEFAULT_CACHE_FILE,
    });
    res.setHeader("Cache-Control", "no-store");
    return res.status(artifact.ready ? 200 : 409).json({
      schemaVersion: CRAFT_SCHEMA_VERSION,
      ...artifact,
    });
  });

  app.post("/craft/notes/page-anchors", (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    const notes = buildScreenwritingCraftNoteAnchors({
      draft: draftFromBody(body),
      craftArea: body.craftArea || body.area || "",
      genre: body.genre || "",
      maxNotes: body.maxNotes || 8,
    });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ schemaVersion: CRAFT_SCHEMA_VERSION, notes });
  });

  app.post("/craft/lint/formatting", (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    const warnings = buildFormattingLintWarnings({
      draft: draftFromBody(body),
      format: body.format || "fountain",
      maxWarnings: body.maxWarnings || 10,
    });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ schemaVersion: CRAFT_SCHEMA_VERSION, warnings });
  });

  app.post("/craft/doctor/genre", (req, res) => {
    if (!checkClientSchemaVersion(req, res)) return;
    const body = req.body || {};
    const passes = buildGenreDoctorPasses({
      genre: body.genre || "",
      draft: draftFromBody(body),
      maxPasses: body.maxPasses || 3,
    });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ schemaVersion: CRAFT_SCHEMA_VERSION, passes });
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
}

export { mountCraftRoutes };
