import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import {
  mountAccountRoutes,
  EXPORTABLE_DOMAINS,
  DEFAULT_SOFT_DELETE_WINDOW_MS,
} from "../lib/account_routes.js";

function makeApp({
  user = { id: "alice" },
  reauthOk = true,
  exportData = null,
  exportError = null,
  revokeError = null,
  lifecycle = null,
  lifecycleMarkError = null,
  now = () => 1700000000000,
  softDeleteWindowMs,
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.requestId = "test-req"; next(); });

  const audits = [];
  const sessions = { revoked: false };
  const lifecycleState = new Map();
  const lifecycleStore = lifecycle ?? {
    async markPendingDeletion({ userId, pendingDeletionAt, hardDeleteAt, reason }) {
      if (lifecycleMarkError) throw lifecycleMarkError;
      lifecycleState.set(userId, { pendingDeletionAt, hardDeleteAt, reason });
    },
    async clearPendingDeletion(userId) {
      lifecycleState.delete(userId);
    },
    async read(userId) {
      return lifecycleState.get(userId) || null;
    },
  };

  mountAccountRoutes(app, {
    resolveAuthenticatedUser: async () => user,
    verifyReauthProof: async () => reauthOk,
    exportUserData: async ({ userId, domains }) => {
      if (exportError) throw exportError;
      return exportData ?? {
        domains: Object.fromEntries(domains.map((d) => [d, { sample: `${d}-${userId}` }])),
      };
    },
    lifecycleStore,
    revokeAllSessions: async () => {
      if (revokeError) throw revokeError;
      sessions.revoked = true;
    },
    auditLog: async (entry) => { audits.push(entry); },
    now,
    softDeleteWindowMs,
  });
  return { app, audits, sessions, lifecycleState };
}

async function hit(app, method, path, body, headers) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, body: json ?? text };
  } finally {
    server.close();
  }
}

test("[account] GET /account/export returns a JSON envelope for the user", async () => {
  const { app, audits } = makeApp();
  const { status, body, headers } = await hit(app, "GET", "/account/export");
  assert.equal(status, 200);
  assert.equal(body.schema, "io.them.account_export.v1");
  assert.equal(body.user_id, "alice");
  assert.equal(typeof body.domains, "object");
  for (const d of EXPORTABLE_DOMAINS) {
    assert.ok(d in body.domains, `domain ${d} should be in payload`);
  }
  assert.match(headers.get("content-disposition") || "", /io-them-export-alice\.json/);
  assert.deepEqual(audits.map((a) => a.event), [
    "account_export_requested",
    "account_export_completed",
  ]);
});

test("[account] GET /account/export → 401 when unauthenticated", async () => {
  const { app } = makeApp({ user: null });
  const { status, body } = await hit(app, "GET", "/account/export");
  assert.equal(status, 401);
  assert.equal(body.error, "unauthorized");
});

test("[account] GET /account/export → 500 when export throws", async () => {
  const { app, audits } = makeApp({ exportError: new Error("boom") });
  const { status, body } = await hit(app, "GET", "/account/export");
  assert.equal(status, 500);
  assert.equal(body.error, "export_failed");
  assert.match(body.message, /boom/);
  // The "requested" audit fires before the export attempt; "completed" must not.
  assert.deepEqual(audits.map((a) => a.event), ["account_export_requested"]);
});

test("[account] DELETE /account → 202 and marks pending deletion", async () => {
  const { app, audits, sessions, lifecycleState } =
    makeApp({ now: () => 1_700_000_000_000 });
  const { status, body } = await hit(app, "DELETE", "/account", { reason: "trying it out" });
  assert.equal(status, 202);
  assert.equal(body.status, "pending_deletion");
  assert.equal(body.recovery_window_days, 7);
  assert.equal(sessions.revoked, true);
  const entry = lifecycleState.get("alice");
  assert.ok(entry, "lifecycle entry should be written");
  assert.equal(entry.reason, "trying it out");
  assert.equal(
    entry.hardDeleteAt - entry.pendingDeletionAt,
    DEFAULT_SOFT_DELETE_WINDOW_MS
  );
  assert.deepEqual(audits.map((a) => a.event), ["account_deletion_requested"]);
});

test("[account] DELETE /account → 403 when reauth fails", async () => {
  const { app, lifecycleState } = makeApp({ reauthOk: false });
  const { status, body } = await hit(app, "DELETE", "/account", {});
  assert.equal(status, 403);
  assert.equal(body.error, "reauth_required");
  assert.equal(lifecycleState.size, 0, "must not mark deletion without reauth");
});

test("[account] DELETE /account → 401 when unauthenticated", async () => {
  const { app } = makeApp({ user: null });
  const { status, body } = await hit(app, "DELETE", "/account", {});
  assert.equal(status, 401);
  assert.equal(body.error, "unauthorized");
});

test("[account] DELETE /account → 503 without scheduling deletion when durable session revocation fails", async () => {
  const revokeError = new Error("adapter write failed");
  revokeError.code = "AUTH_PERSISTENCE_FAILED";
  revokeError.retryable = true;
  const { app, audits, sessions, lifecycleState } = makeApp({ revokeError });

  const { status, body } = await hit(app, "DELETE", "/account", {});

  assert.equal(status, 503);
  assert.equal(body.stage, "account_delete");
  assert.equal(body.error, "auth_persistence_failed");
  assert.equal(body.retryable, true);
  assert.equal(sessions.revoked, false);
  assert.equal(lifecycleState.size, 0, "deletion must not be scheduled before durable revocation");
  assert.equal(
    audits.some((entry) => entry.event === "account_deletion_requested"),
    false,
    "must not emit a success audit when session revocation was not durable"
  );
});

test("[account] DELETE /account lifecycle failure leaves no deletion scheduled after revocation", async () => {
  const { app, audits, sessions, lifecycleState } = makeApp({
    lifecycleMarkError: new Error("lifecycle write failed"),
  });

  const { status, body } = await hit(app, "DELETE", "/account", {});

  assert.equal(status, 500);
  assert.equal(body.error, "deletion_request_failed");
  assert.equal(sessions.revoked, true, "session revocation completes before lifecycle scheduling");
  assert.equal(lifecycleState.size, 0, "failed lifecycle write cannot queue hard deletion");
  assert.equal(
    audits.some((entry) => entry.event === "account_deletion_requested"),
    false,
    "must not emit a success audit after failed lifecycle scheduling"
  );
});

test("[account] POST /account/cancel-deletion → cancels pending deletion", async () => {
  const { app, audits, lifecycleState } = makeApp();
  await hit(app, "DELETE", "/account", {});
  assert.equal(lifecycleState.size, 1, "deletion is pending");
  const { status, body } = await hit(app, "POST", "/account/cancel-deletion", {});
  assert.equal(status, 200);
  assert.equal(body.status, "active");
  assert.equal(lifecycleState.size, 0);
  assert.deepEqual(audits.map((a) => a.event), [
    "account_deletion_requested",
    "account_deletion_cancelled",
  ]);
});

test("[account] POST /account/cancel-deletion → idempotent on non-pending account", async () => {
  const { app, audits } = makeApp();
  const { status, body } = await hit(app, "POST", "/account/cancel-deletion", {});
  assert.equal(status, 200);
  assert.equal(body.status, "active");
  assert.equal(audits.length, 0, "no audit when nothing to cancel");
});

test("[account] softDeleteWindowMs override is honored (tests can set 0 for fast hard-delete)", async () => {
  const { app, lifecycleState } = makeApp({
    softDeleteWindowMs: 1000,
    now: () => 1_000_000,
  });
  await hit(app, "DELETE", "/account", {});
  const entry = lifecycleState.get("alice");
  assert.equal(entry.hardDeleteAt - entry.pendingDeletionAt, 1000);
});

test("[account] mountAccountRoutes requires deps", () => {
  const app = express();
  assert.throws(() => mountAccountRoutes(app, {}), /resolveAuthenticatedUser/);
  assert.throws(() => mountAccountRoutes(null, {}), /requires an Express app/);
});
