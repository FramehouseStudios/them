// T-first-page-telemetry-sink — POST /telemetry/first-page-written
// and GET /telemetry/first-page-written/stats.
//
// POST: client fires when the authenticated user ships their first
// formatted page. Body accepts snake_case + camelCase. Idempotent.
//
// GET stats: returns aggregate `{ total, medianSeconds, percentile90Seconds }`
// across all users. The user-auth middleware protects this route family.

import express from "express";

import {
  recordFirstPageWritten,
  listFirstPageEvents,
  summarizeFirstPageEvents,
  firstPageTelemetryDeps,
} from "./first_page_telemetry.js";

// T-route-local-parsers / Codex #90: every route that reads
// req.body mounts its own express.json(). Telemetry payload is
// small (~ a few fields); 32kb is plenty.
const FIRST_PAGE_TELEMETRY_BODY_LIMIT = "32kb";

function pickFirstString(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length) return c;
  }
  return "";
}

function defaultResolveUserId(req) {
  return (req && req.authUser && req.authUser.id) || null;
}

function authenticatedAccountAgeSeconds(req, nowMs) {
  const createdAtMs = Number(req && req.authUser && req.authUser.createdAt);
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0 || createdAtMs > nowMs) return null;
  return Math.max(0, (nowMs - createdAtMs) / 1000);
}

function mountFirstPageTelemetryRoute(app, {
  resolveUserId = defaultResolveUserId,
  now = () => Date.now(),
} = {}) {
  if (!app || typeof app.post !== "function" || typeof app.get !== "function") {
    throw new Error("mountFirstPageTelemetryRoute requires an Express app");
  }

  app.post("/telemetry/first-page-written", express.json({ limit: FIRST_PAGE_TELEMETRY_BODY_LIMIT }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const body = req.body || {};
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({
        stage: "first_page_telemetry",
        error: "user_auth_required",
      });
    }
    const projectId = pickFirstString(body.projectId, body.project_id) || null;
    const versionId = pickFirstString(body.versionId, body.version_id) || null;
    const source = pickFirstString(body.source, body.first_page_written_source_raw) || null;
    const clientSecondsToFirstPage = Number.isFinite(body.secondsToFirstPage)
      ? body.secondsToFirstPage
      : Number.isFinite(body.seconds_to_first_page)
        ? body.seconds_to_first_page
        : null;
    const nowMs = now();
    const secondsToFirstPage = authenticatedAccountAgeSeconds(req, nowMs) ?? clientSecondsToFirstPage;
    const occurredAtRaw = Number.isFinite(body.occurredAtMs)
      ? body.occurredAtMs
      : Number.isFinite(body.occurred_at_ms)
        ? body.occurred_at_ms
        : null;
    const { persistence } = firstPageTelemetryDeps();
    if (!persistence) {
      return res.status(500).json({
        ok: false,
        action: "error",
        error: "first_page_telemetry_persistence_unavailable",
      });
    }
    try {
      const result = await recordFirstPageWritten({
        persistence,
        userId,
        projectId,
        versionId,
        source,
        secondsToFirstPage,
        occurredAtMs: occurredAtRaw === null ? nowMs : occurredAtRaw,
      });
      return res.status(200).json({ schemaVersion: 1, ...result });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        action: "error",
        error: e?.message || "first_page_telemetry_failed",
      });
    }
  });

  app.get("/telemetry/first-page-written/stats", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { persistence } = firstPageTelemetryDeps();
    if (!persistence) {
      return res.status(500).json({
        schemaVersion: 1,
        error: "first_page_telemetry_persistence_unavailable",
      });
    }
    try {
      const entries = await listFirstPageEvents({ persistence });
      const summary = summarizeFirstPageEvents(entries);
      return res.status(200).json({ schemaVersion: 1, ...summary });
    } catch (e) {
      return res.status(500).json({
        schemaVersion: 1,
        error: e?.message || "first_page_telemetry_stats_failed",
      });
    }
  });
}

export { mountFirstPageTelemetryRoute };
