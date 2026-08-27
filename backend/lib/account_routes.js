// /account/* routes — Apple App Store Guideline 5.1.1(v) + GDPR
// Articles 17 and 20 compliance.
//
// Spec: docs/specs/T-account-deletion-and-export.md
// Migration: backend/migrations/008_account_lifecycle.sql
//
// This module ships the route shapes + behavior with the deps
// injected, so tests exercise the contract without a live Postgres.
// Wiring into the canonical user store + lifecycle table happens
// at the `mountAccountRoutes` call site in index.js.

const DEFAULT_SOFT_DELETE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const EXPORTABLE_DOMAINS = Object.freeze([
  "outbox",
  "user_memory",
  "screenplay",
  "knowledge_embeddings",
  "craft_reports",
  "craft_overrides",
  "craft_classifications",
  "creative_memory",
  "craft_loglines",
  "accepted_twists",
  "telemetry_first_page_written",
]);

function mountAccountRoutes(app, deps) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountAccountRoutes requires an Express app");
  }
  const required = ["resolveAuthenticatedUser", "exportUserData", "lifecycleStore"];
  for (const k of required) {
    if (!(k in (deps || {}))) {
      throw new Error(`mountAccountRoutes requires deps.${k}`);
    }
  }
  const softDeleteWindowMs = Number(deps.softDeleteWindowMs ?? DEFAULT_SOFT_DELETE_WINDOW_MS);
  const now = typeof deps.now === "function" ? deps.now : () => Date.now();
  const audit = typeof deps.auditLog === "function" ? deps.auditLog : async () => {};

  // GET /account/export
  // Returns every store row owned by the authenticated user as one
  // JSON envelope. Streaming export for very large accounts is a
  // follow-up.
  app.get("/account/export", async (req, res) => {
    const user = await deps.resolveAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }
    await audit({
      userId: user.id,
      event: "account_export_requested",
      requestId: req.requestId || null,
    });
    let payload;
    try {
      payload = await deps.exportUserData({ userId: user.id, domains: EXPORTABLE_DOMAINS });
    } catch (err) {
      return res.status(500).json({
        error: "export_failed",
        message: String(err?.message || "unknown"),
      });
    }
    await audit({
      userId: user.id,
      event: "account_export_completed",
      requestId: req.requestId || null,
      metadata: { domain_count: Object.keys(payload?.domains || {}).length },
    });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="io-them-export-${user.id}.json"`);
    res.status(200).json({
      schema: "io.them.account_export.v1",
      exported_at: new Date(now()).toISOString(),
      user_id: user.id,
      ...payload,
    });
  });

  // DELETE /account
  // Soft-delete with a 7-day recovery window. Requires a fresh
  // re-auth proof (separate from the bearer session) — the caller
  // wires `verifyReauthProof` to check a password challenge or a
  // fresh Apple identity-token.
  app.delete("/account", async (req, res) => {
    const user = await deps.resolveAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (typeof deps.verifyReauthProof === "function") {
      const ok = await deps.verifyReauthProof(req, user);
      if (!ok) {
        return res.status(403).json({ error: "reauth_required" });
      }
    }
    const reason = String(req.body?.reason || "").slice(0, 280);
    const pendingDeletionAt = now();
    const hardDeleteAt = pendingDeletionAt + softDeleteWindowMs;
    try {
      // Revoke first. A later lifecycle-write failure may sign the user out,
      // but it cannot leave an unacknowledged hard deletion scheduled. The
      // inverse ordering requires a compensating delete that can itself fail.
      if (typeof deps.revokeAllSessions === "function") {
        await deps.revokeAllSessions(user.id);
      }
      await deps.lifecycleStore.markPendingDeletion({
        userId: user.id,
        pendingDeletionAt,
        hardDeleteAt,
        reason,
      });
    } catch (err) {
      if (String(err?.code || "") === "AUTH_PERSISTENCE_FAILED") {
        return res.status(503).json({
          stage: "account_delete",
          error: "auth_persistence_failed",
          retryable: Boolean(err?.retryable),
        });
      }
      return res.status(500).json({
        error: "deletion_request_failed",
      });
    }
    await audit({
      userId: user.id,
      event: "account_deletion_requested",
      requestId: req.requestId || null,
      metadata: { hard_delete_at: new Date(hardDeleteAt).toISOString() },
    });
    res.status(202).json({
      status: "pending_deletion",
      pending_deletion_at: new Date(pendingDeletionAt).toISOString(),
      hard_delete_at: new Date(hardDeleteAt).toISOString(),
      recovery_window_days: Math.round(softDeleteWindowMs / 86400000),
    });
  });

  // POST /account/cancel-deletion
  // Cancels a pending deletion if the user signs in inside the
  // recovery window. Idempotent — calling on a non-pending account
  // returns 200 with status:"active".
  app.post("/account/cancel-deletion", async (req, res) => {
    const user = await deps.resolveAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const current = await deps.lifecycleStore.read(user.id);
    if (!current || !current.pendingDeletionAt) {
      return res.status(200).json({ status: "active" });
    }
    await deps.lifecycleStore.clearPendingDeletion(user.id);
    await audit({
      userId: user.id,
      event: "account_deletion_cancelled",
      requestId: req.requestId || null,
    });
    res.status(200).json({ status: "active" });
  });
}

export {
  mountAccountRoutes,
  EXPORTABLE_DOMAINS,
  DEFAULT_SOFT_DELETE_WINDOW_MS,
};
