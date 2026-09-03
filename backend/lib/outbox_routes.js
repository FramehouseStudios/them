// T-decompose-phase6-1a-outbox-data-state — mountOutboxRoutes
//
// Phase 6.1a of docs/specs/T-decompose-backend-index.md. Extracts
// GET /outbox + POST /outbox/retry out of backend/index.js.
//
// V1 pillar: infra
// V1 effect: infrastructure for iOS Release Readiness — keeps the global
// queue control plane unavailable to app and ordinary user credentials.
//
// The extracted handler response contracts remain unchanged behind a
// server-only operator credential. Mount order is preserved by the call site.
//
// No module-level mutable state; deps injected; boundary proven by
// backend/tools/freevars.mjs (acorn). /outbox/retry retains its route-local
// express.json({limit:'256kb'}) parser after the authorization guard.

import { createHash, timingSafeEqual } from "node:crypto";
import express from "express";

const OUTBOX_OPERATOR_HEADER = "X-OUTBOX-OPERATOR-TOKEN";

function outboxOperatorTokenMatches(candidate, expected) {
  const presented = String(candidate || "");
  const configured = String(expected || "");
  if (!presented || !configured) return false;

  // Hash first so timingSafeEqual always receives equal-length buffers. This
  // keeps malformed or attacker-controlled header lengths from throwing and
  // avoids a direct secret comparison with early-exit timing behavior.
  const presentedDigest = createHash("sha256").update(presented, "utf8").digest();
  const configuredDigest = createHash("sha256").update(configured, "utf8").digest();
  return timingSafeEqual(presentedDigest, configuredDigest);
}

function createOutboxOperatorGuard(operatorToken) {
  const configuredToken = String(operatorToken || "").trim();
  return function requireOutboxOperator(req, res, next) {
    // No operator credential means the HTTP control plane is disabled. Keep
    // the response indistinguishable from an unmounted production route.
    if (!configuredToken) {
      return res.status(404).json({ stage: "route", error: "Not found." });
    }
    const presentedToken = req.get(OUTBOX_OPERATOR_HEADER);
    if (!outboxOperatorTokenMatches(presentedToken, configuredToken)) {
      return res.status(401).json({ stage: "outbox_operator", error: "Unauthorized" });
    }
    return next();
  };
}

function mountOutboxRoutes(app, deps = {}) {
  if (!deps || typeof deps !== "object") {
    throw new Error("mountOutboxRoutes requires a deps object");
  }
  const {
    OUTBOX_OPERATOR_TOKEN,
    OUTBOX_WORKER_BATCH_SIZE,
    createRequestId,
    parseQueryLimit,
    processOutboxBatch,
    processSingleOutboxItemById,
    scaleBackplane,
  } = deps;
  for (const k of ["OUTBOX_OPERATOR_TOKEN","processOutboxBatch","processSingleOutboxItemById","parseQueryLimit"]) {
    if (deps[k] === undefined) throw new Error("mountOutboxRoutes requires dep: " + k);
  }
  const requireOutboxOperator = createOutboxOperatorGuard(OUTBOX_OPERATOR_TOKEN);

  app.get("/outbox", requireOutboxOperator, async (req, res) => {
    const status = String(req.query?.status || "all").trim().toLowerCase();
    const limit = parseQueryLimit(req.query?.limit, 80, 500);
    // Operator control plane: explicitly opt into the cross-user view. The
    // store fails closed without a userId or this flag.
    const rows = await scaleBackplane.listOutbox({
      status: ["all", "pending", "completed", "failed"].includes(status) ? status : "all",
      limit,
      allowAllUsers: true,
    });
    return res.status(200).json({
      ok: true,
      status_filter: status,
      limit,
      count: rows.length,
      items: rows,
    });
  });

  app.post("/outbox/retry", requireOutboxOperator, express.json({ limit: "256kb" }), async (req, res) => {
    const rid = req.requestId || createRequestId();
    const id = String(req.body?.id || "").trim();
    if (id) {
      const result = await processSingleOutboxItemById(id, rid, null, true);
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
      allowAllUsers: true,
    });
    return res.status(200).json({
      ok: true,
      ...batch,
    });
  });
}

export { mountOutboxRoutes };
