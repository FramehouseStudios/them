// T-decompose-phase3-screenplay-companion — extract the
// `/screenplay/companion/state`, `/screenplay/paginate`, and
// `/screenplay/revision-colors` routes from backend/index.js.
//
// Phase 3 of the decomposition (spec:
// `docs/specs/T-decompose-backend-index.md`). Phase 0 (#183),
// Phase 1 (#190), Phase 2a (#192), and Phase 2b (#197) all merged
// on main. Per spec, max 1 decomposition PR in flight.
//
// Routes:
//
//   GET  /screenplay/companion/state
//   POST /screenplay/companion/state
//   POST /screenplay/paginate
//   POST /screenplay/revision-colors
//
// Behavior is byte-identical with the previous inline handlers
// (same response shape, status codes, headers). All deps are
// passed by reference (or accessor functions for live state).
// Each POST mounts its own express.json() with the inline
// handler's limit (Codex #90 + pre-flight rule from #193).
//
// Access-control posture:
//   - /screenplay/companion/state — PER-USER. Reads/writes the
//     owner's companion state (mode, recent turns, analytics,
//     signals). Same posture as Phase 2.
//   - /screenplay/paginate — STATELESS / PUBLIC. Pure
//     transformation: draft text in, page breakdown out. No
//     owner record involved. Safe to call without auth.
//   - /screenplay/revision-colors — STATELESS / PUBLIC. Pure
//     diff transformation: base draft + new draft → revision
//     payload. No owner record involved.
//
// The two stateless routes are documented as "stateless" in the
// posture comment but inherit no special access gate — they
// already ran unauthenticated in the existing inline code, and
// this PR preserves that exact behavior (no access-control
// change; only a code-organization change).

import express from "express";

function mountScreenplayCompanionRoutes(app, deps = {}) {
  if (!app || typeof app.post !== "function" || typeof app.get !== "function") {
    throw new Error("mountScreenplayCompanionRoutes requires an Express app");
  }
  const {
    // Owner / state
    getOrCreateScreenplayOwnerRecord,
    markScreenplayOwnerDirty,
    refreshScreenplayOwnerRecord,
    normalizeStoredScreenplayCompanionState,
    toScreenplayCompanionStatePayload,
    // Envelope + headers
    buildScreenplayEnvelope,
    buildScreenplayReadMeta,
    applyReadStateHeaders,
    // Helpers
    normalizeClientIp,
    clientIp,
    normalizeSnippet,
    normalizeScreenplayPhaseValue,
    parsePositiveInt,
    splitScreenplayLines,
    buildDraftExcerpt,
    buildScreenplayRevisionPayload,
  } = deps;

  const requiredFns = {
    getOrCreateScreenplayOwnerRecord,
    markScreenplayOwnerDirty,
    refreshScreenplayOwnerRecord,
    normalizeStoredScreenplayCompanionState,
    toScreenplayCompanionStatePayload,
    buildScreenplayEnvelope,
    buildScreenplayReadMeta,
    applyReadStateHeaders,
    normalizeClientIp,
    clientIp,
    normalizeSnippet,
    normalizeScreenplayPhaseValue,
    parsePositiveInt,
    splitScreenplayLines,
    buildDraftExcerpt,
    buildScreenplayRevisionPayload,
  };
  for (const [key, fn] of Object.entries(requiredFns)) {
    if (typeof fn !== "function") {
      throw new Error(`mountScreenplayCompanionRoutes: ${key} is required`);
    }
  }

  async function persistCompanionOwnerOrFail(res, owner, now) {
    const result = markScreenplayOwnerDirty(owner, now);
    if (result === false || result?.ok === false) {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({
        stage: "screenplay_companion_state",
        error: "screenplay_persistence_failed",
      });
      return null;
    }
    let committedOwner = result?.owner || owner;
    if (result?.persistencePromise) {
      const persisted = await result.persistencePromise;
      if (persisted?.ok === false) {
        res.setHeader("Cache-Control", "no-store");
        res.status(503).json({
          stage: "screenplay_companion_state",
          error: "screenplay_persistence_failed",
          persistence: persisted.persistenceKind || result.persistenceKind || "unknown",
          persistence_failure_count: persisted.persistenceFailureCount || 1,
        });
        return null;
      }
      committedOwner = persisted?.owner || committedOwner;
    }
    return committedOwner;
  }

  async function getFreshCompanionOwner(req, res) {
    const cachedOwner = getOrCreateScreenplayOwnerRecord(req, { create: true });
    let refreshed;
    try {
      refreshed = await refreshScreenplayOwnerRecord(cachedOwner.ownerKey);
    } catch (error) {
      refreshed = { ok: false, error };
    }
    if (!refreshed?.ok) {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({
        stage: "screenplay_companion_state",
        error: "screenplay_persistence_failed",
        persistence: refreshed?.persistenceKind || "unknown",
      });
      return null;
    }
    if (!refreshed.owner) {
      res.setHeader("Cache-Control", "no-store");
      res.status(404).json({
        stage: "screenplay_companion_state",
        error: "screenplay_owner_not_found",
      });
      return null;
    }
    return refreshed.owner;
  }

  app.get("/screenplay/companion/state", async (req, res) => {
    const owner = await getFreshCompanionOwner(req, res);
    if (!owner) return;
    owner.companionState = normalizeStoredScreenplayCompanionState(owner.companionState);
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_companion_state",
      status: "ok",
      source: "screenplay_store",
      source_ip: normalizeClientIp(clientIp(req)),
      ...toScreenplayCompanionStatePayload(owner.companionState),
    }));
  });

  app.post("/screenplay/companion/state", express.json({ limit: "256kb" }), async (req, res) => {
    const owner = await getFreshCompanionOwner(req, res);
    if (!owner) return;
    const now = Date.now();
    const existingCompanionState = normalizeStoredScreenplayCompanionState(owner.companionState);
    const nextCompanionState = normalizeStoredScreenplayCompanionState({
      mode_raw: req.body?.mode_raw,
      recent_turns: req.body?.recent_turns,
      analytics: req.body?.analytics,
      signals: req.body?.signals,
    });
    if (!nextCompanionState.analytics.firstPageWrittenAt && existingCompanionState.analytics.firstPageWrittenAt > 0) {
      nextCompanionState.analytics.firstPageWrittenAt = existingCompanionState.analytics.firstPageWrittenAt;
      nextCompanionState.analytics.firstPageWrittenSourceRaw = existingCompanionState.analytics.firstPageWrittenSourceRaw;
      nextCompanionState.analytics.firstPageWrittenProjectId = existingCompanionState.analytics.firstPageWrittenProjectId;
      nextCompanionState.analytics.firstPageWrittenVersionId = existingCompanionState.analytics.firstPageWrittenVersionId;
    }
    owner.companionState = nextCompanionState;
    if (!owner.companionState.analytics.updatedAt || owner.companionState.analytics.updatedAt <= 0) {
      owner.companionState.analytics.updatedAt = now;
    }
    const committedOwner = await persistCompanionOwnerOrFail(res, owner, now);
    if (!committedOwner) return;
    const committedState = normalizeStoredScreenplayCompanionState(committedOwner.companionState);
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, committedOwner));
    return res.status(200).json(buildScreenplayEnvelope(req, committedOwner, {
      stage: "screenplay_companion_state",
      status: "saved",
      source: "screenplay_store",
      source_ip: normalizeClientIp(clientIp(req)),
      ...toScreenplayCompanionStatePayload(committedState),
    }));
  });

  app.post("/screenplay/paginate", express.json({ limit: "2mb" }), (req, res) => {
    // Page ranges address the editor's original lines. Trimming would shift
    // every leading-blank-line anchor and leave trailing editor lines unmapped.
    const draft = String(req.body?.draft || "").replace(/\r\n?/g, "\n");
    if (!draft.trim()) {
      return res.status(400).json({ stage: "screenplay_paginate", error: "draft_required" });
    }
    const title = normalizeSnippet(req.body?.title, 160);
    const phase = normalizeScreenplayPhaseValue(req.body?.phase);
    const linesPerPage = Math.max(24, Math.min(120, parsePositiveInt(req.body?.lines_per_page, 55)));
    const lines = splitScreenplayLines(draft);
    const pages = [];
    for (let cursor = 0; cursor < lines.length; cursor += linesPerPage) {
      const pageLines = lines.slice(cursor, cursor + linesPerPage);
      const pageIndex = pages.length + 1;
      pages.push({
        page: pageIndex,
        start_line: cursor + 1,
        end_line: cursor + pageLines.length,
        line_count: pageLines.length,
        preview: buildDraftExcerpt(pageLines.join(" "), 140),
        est_minutes: Number((pageLines.length / 55).toFixed(2)),
      });
    }
    if (pages.length === 0) {
      pages.push({
        page: 1,
        start_line: 1,
        end_line: 1,
        line_count: 0,
        preview: "",
        est_minutes: 0,
      });
    }
    const lengthProfile = pages.length <= 2 ? "short" : (pages.length <= 6 ? "standard" : "long");
    return res.status(200).json({
      stage: "screenplay_paginate",
      mode: "computed",
      title,
      phase,
      target_pages: Number(req.body?.target_pages || 0) || null,
      page_count: pages.length,
      line_count: lines.length,
      lines_per_page: linesPerPage,
      pages,
      length_profile: lengthProfile,
    });
  });

  app.post("/screenplay/revision-colors", express.json({ limit: "2mb" }), (req, res) => {
    const draft = String(req.body?.draft || "").replace(/\r\n/g, "\n").trim();
    if (!draft) {
      return res.status(400).json({ stage: "screenplay_revision", error: "draft_required" });
    }
    const payload = buildScreenplayRevisionPayload(
      String(req.body?.base_draft || "").replace(/\r\n/g, "\n"),
      draft,
      normalizeSnippet(req.body?.revision_color, 24) || "blue"
    );
    return res.status(200).json(payload);
  });
}

export { mountScreenplayCompanionRoutes };
