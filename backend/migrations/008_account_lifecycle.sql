-- backend/migrations/008_account_lifecycle.sql
--
-- T-account-deletion-and-export — schema support for Apple/GDPR-
-- compliant account lifecycle. Adds soft-delete columns to the user
-- store and a separate audit log for account-lifecycle events.
--
-- The user_store rows currently live in persistence_user_memory keyed
-- by user id; the soft-delete columns are surfaced as a derived
-- helper table for indexed queries (sweep job, login gate). This
-- preserves the JSONB shape used everywhere else without forcing
-- user_store consumers to upgrade.
--
-- Apply via `node scripts/apply_migrations.mjs`. Idempotent.

BEGIN;

-- Per-user lifecycle flags. The canonical user record stays in the
-- persistence_user_memory JSONB column; this table is the indexed
-- shadow used by:
--   - the 7-day hard-delete sweep job
--   - the login gate (refuse login during pending-deletion window)
--   - data export / audit reporting
CREATE TABLE IF NOT EXISTS account_lifecycle (
    user_id              TEXT PRIMARY KEY,
    pending_deletion_at  TIMESTAMPTZ,
    hard_delete_at       TIMESTAMPTZ,
    -- Reason is freeform text the user can supply ("not using it")
    -- and is included in the audit log but NEVER in support context.
    reason               TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_lifecycle_hard_delete_at_idx
    ON account_lifecycle (hard_delete_at)
    WHERE hard_delete_at IS NOT NULL;

-- Append-only audit log for compliance. Retention is decided
-- separately by legal; this table just stores the events.
CREATE TABLE IF NOT EXISTS account_audit_log (
    id           BIGSERIAL PRIMARY KEY,
    user_id      TEXT NOT NULL,
    event        TEXT NOT NULL CHECK (event IN (
        'account_export_requested',
        'account_export_completed',
        'account_deletion_requested',
        'account_deletion_cancelled',
        'account_hard_deleted'
    )),
    request_id   TEXT,
    actor_ip     TEXT,
    metadata     JSONB DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_audit_log_user_id_idx
    ON account_audit_log (user_id, created_at DESC);

COMMIT;
