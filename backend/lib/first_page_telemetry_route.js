// T-first-page-telemetry-sink — POST /telemetry/first-page-written
// and GET /telemetry/first-page-written/stats.
//
// POST: client fires when the user ships their first formatted page.
// Body accepts snake_case + camelCase; resolves userId from
// req.user (defensive fallback to body.userId). Idempotent.
//
// GET stats: returns aggregate `{ total, medianSeconds, percentile90Seconds }`
// across all users. Read-only; no auth gate — the values are
// aggregate, not per-user.

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
  return (
    (req && req.user && req.user.id) ||
    (req && req.authUser && req.authUser.id) ||
    (req && req.userId) ||
    null
  );
}

function mountFirstPageTelemetryRoute(app, {
  resolveUserId = defaultResolveUserId,
} = {}) {
  if (!app || typeof app.post !== "function" || typeof app.get !== "function") {
    throw new Error("mountFirstPageTelemetryRoute requires an Express app");
  }

  app.post("/telemetry/first-page-written", express.json({ limit: FIRST_PAGE_TELEMETRY_BODY_LIMIT }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const body = req.body || {};
    const userId = resolveUserId(req) || pickFirstString(body.userId, body.user_id);
    if (!userId) {
      // Match the existing memory-write semantics: skipped, not 401.
      return res.status(200).json({ ok: false, action: "skipped", reason: "missing_userId" });
    }
    const projectId = pickFirstString(body.projectId, body.project_id) || null;
    const versionId = pickFirstString(body.versionId, body.version_id) || null;
    const source = pickFirstString(body.source, body.first_page_written_source_raw) || null;
    const secondsToFirstPage = Number.isFinite(body.secondsToFirstPage)
      ? body.secondsToFirstPage
      : Number.isFinite(body.seconds_to_first_page)
        ? body.seconds_to_first_page
        : null;
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
        occurredAtMs: occurredAtRaw === null ? Date.now() : occurredAtRaw,
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
