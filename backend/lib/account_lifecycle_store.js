// Account-lifecycle store — backs the soft-delete window for
// T-account-deletion-and-export.
//
// Persists to the `account_lifecycle` table from
// backend/migrations/008_account_lifecycle.sql and writes an
// append-only row to `account_audit_log` for every lifecycle event.
//
// Takes an injected pg-style client (`{ query }`) exactly like
// lib/persistence_postgres.js, so it is unit-testable with an
// in-memory fake and shares the production pool when wired in
// index.js. Wiring is deliberately a separate step (one adoption
// per PR) — this module ships pure + tested only.

const VALID_EVENTS = new Set([
  "account_export_requested",
  "account_export_completed",
  "account_deletion_requested",
  "account_deletion_cancelled",
  "account_hard_deleted",
]);

function createAccountLifecycleStore({ client, now = () => Date.now() } = {}) {
  if (!client || typeof client.query !== "function") {
    throw new Error("createAccountLifecycleStore requires a pg-style client with .query()");
  }

  function tsISO(ms) {
    return new Date(ms).toISOString();
  }

  async function audit({ userId, event, requestId = null, actorIp = null, metadata = {} }) {
    if (!VALID_EVENTS.has(event)) {
      throw new Error(`unknown account_audit_log event: ${event}`);
    }
    await client.query(
      `INSERT INTO account_audit_log (user_id, event, request_id, actor_ip, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [String(userId), event, requestId, actorIp, JSON.stringify(metadata || {})]
    );
  }

  async function read(userId) {
    const r = await client.query(
      `SELECT user_id, pending_deletion_at, hard_delete_at, reason
         FROM account_lifecycle WHERE user_id = $1`,
      [String(userId)]
    );
    const row = r?.rows?.[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      pendingDeletionAt: row.pending_deletion_at ? new Date(row.pending_deletion_at).getTime() : null,
      hardDeleteAt: row.hard_delete_at ? new Date(row.hard_delete_at).getTime() : null,
      reason: row.reason || null,
    };
  }

  async function markPendingDeletion({ userId, pendingDeletionAt, hardDeleteAt, reason = null }) {
    const uid = String(userId);
    await client.query(
      `WITH lifecycle_write AS (
         INSERT INTO account_lifecycle
           (user_id, pending_deletion_at, hard_delete_at, reason, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET pending_deletion_at = EXCLUDED.pending_deletion_at,
               hard_delete_at      = EXCLUDED.hard_delete_at,
               reason              = EXCLUDED.reason,
               updated_at          = NOW()
         RETURNING user_id
       )
       INSERT INTO account_audit_log (user_id, event, request_id, actor_ip, metadata)
       SELECT user_id, $5, NULL, NULL, $6::jsonb
         FROM lifecycle_write`,
      [
        uid,
        tsISO(pendingDeletionAt),
        tsISO(hardDeleteAt),
        reason,
        "account_deletion_requested",
        JSON.stringify({ hard_delete_at: tsISO(hardDeleteAt) }),
      ]
    );
  }

  async function clearPendingDeletion(userId) {
    const uid = String(userId);
    const r = await client.query(
      `WITH lifecycle_clear AS (
         UPDATE account_lifecycle
            SET pending_deletion_at = NULL, hard_delete_at = NULL,
                reason = NULL, updated_at = NOW()
          WHERE user_id = $1 AND pending_deletion_at IS NOT NULL
          RETURNING user_id
       )
       INSERT INTO account_audit_log (user_id, event, request_id, actor_ip, metadata)
       SELECT user_id, $2, NULL, NULL, $3::jsonb
         FROM lifecycle_clear
       RETURNING user_id`,
      [uid, "account_deletion_cancelled", JSON.stringify({})]
    );
    return (r?.rowCount ?? 0) > 0;
  }

  // For the hard-delete sweep job: every account whose recovery
  // window has fully elapsed as of `now()`.
  async function listDueForHardDelete(limit = 100) {
    const r = await client.query(
      `SELECT user_id FROM account_lifecycle
        WHERE hard_delete_at IS NOT NULL AND hard_delete_at <= $1
        ORDER BY hard_delete_at ASC
        LIMIT $2`,
      [tsISO(now()), Math.max(1, Number(limit) || 100)]
    );
    return (r?.rows || []).map((row) => row.user_id);
  }

  // Called by the sweep after a user's data has actually been
  // erased. Records the terminal audit row and removes the
  // lifecycle row.
  async function finalizeHardDelete(userId) {
    const uid = String(userId);
    await audit({ userId: uid, event: "account_hard_deleted" });
    await client.query(`DELETE FROM account_lifecycle WHERE user_id = $1`, [uid]);
  }

  return {
    read,
    markPendingDeletion,
    clearPendingDeletion,
    listDueForHardDelete,
    finalizeHardDelete,
    audit,
  };
}

export { createAccountLifecycleStore, VALID_EVENTS };
