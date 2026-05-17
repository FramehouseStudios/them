// T-decompose-phase6-1a-outbox-data-state — mountOutboxRoutes
//
// Phase 6.1a of docs/specs/T-decompose-backend-index.md. Extracts
// GET /outbox + POST /outbox/retry out of backend/index.js, byte-identically.
//
// V1 pillar: infra
// V1 effect: infrastructure for iOS Release Readiness — continues the
// backend/index.js decomposition (no release/auth/privacy surface).
//
// BYTE-IDENTICAL: route handler bodies are verbatim text from
// backend/index.js. Mount order is preserved by the call site. The
// method-not-allowed (405) app.all guards are intentionally left
// inline in index.js this phase to guarantee identical Express
// registration order with zero behavioral reasoning.
//
// No module-level mutable state; deps injected; boundary proven by
// backend/tools/freevars.mjs (acorn). Route-local express.json({limit:'256kb'}) parser on /outbox/retry preserved verbatim.

import express from "express";

function mountOutboxRoutes(app, deps = {}) {
  if (!deps || typeof deps !== "object") {
    throw new Error("mountOutboxRoutes requires a deps object");
  }
  const {
    OUTBOX_WORKER_BATCH_SIZE,
    createRequestId,
    parseQueryLimit,
    processOutboxBatch,
    processSingleOutboxItemById,
    scaleBackplane,
  } = deps;
  for (const k of ["processOutboxBatch","processSingleOutboxItemById","parseQueryLimit"]) {
    if (deps[k] === undefined) throw new Error("mountOutboxRoutes requires dep: " + k);
  }

  app.get("/outbox", async (req, res) => {
    const status = String(req.query?.status || "all").trim().toLowerCase();
    const limit = parseQueryLimit(req.query?.limit, 80, 500);
    const rows = await scaleBackplane.listOutbox({
      status: ["all", "pending", "completed", "failed"].includes(status) ? status : "all",
      limit,
    });
    return res.status(200).json({
      ok: true,
      status_filter: status,
      limit,
      count: rows.length,
      items: rows,
    });
  });

  app.post("/outbox/retry", express.json({ limit: "256kb" }), async (req, res) => {
    const rid = req.requestId || createRequestId();
    const id = String(req.body?.id || "").trim();
    if (id) {
      const result = await processSingleOutboxItemById(id, rid);
      const code = result.ok ? 200 : (result.error === "not_found" ? 404 : 409);
      return res.status(code).json({
        ok: Boolean(result.ok),
        id,
        status: result.status || "",
        error: result.error || null,
        item: result.item || null,
      });
    }
    const batch = await processOutboxBatch({
      limit: parseQueryLimit(req.body?.limit, OUTBOX_WORKER_BATCH_SIZE, 200),
      reqId: rid,
    });
    return res.status(200).json({
      ok: true,
      ...batch,
    });
  });
}

export { mountOutboxRoutes };
