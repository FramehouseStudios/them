-- backend/migrations/006_accepted_twists.sql
--
-- T-accepted-twist-log: per-project accepted-twist log (Craft
-- Intelligence Suite, Layer 2 follow-up). One row per
-- `${projectId}:${versionId}:${twistId}` so each acceptance is an
-- immutable entry that prompt-assembly can read.

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_accepted_twists (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_accepted_twists_updated_at_idx
    ON persistence_accepted_twists (updated_at);

COMMIT;
