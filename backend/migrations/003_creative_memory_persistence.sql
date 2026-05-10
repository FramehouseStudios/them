-- backend/migrations/003_creative_memory_persistence.sql
--
-- T08-postgres: persistence table for the creative-companion memory
-- tier. One row per user (key = userId). Apply on top of 002. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_creative_memory (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_creative_memory_updated_at_idx
    ON persistence_creative_memory (updated_at);

COMMIT;
