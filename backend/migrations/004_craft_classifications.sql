-- backend/migrations/004_craft_classifications.sql
--
-- T21 follow-up: per-scene classifier cache. One row per
-- (frameworkId, sceneContentHash) pair. Read-only key scheme; the
-- cache is opportunistic — cold reads always re-classify.

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_craft_classifications (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_craft_classifications_updated_at_idx
    ON persistence_craft_classifications (updated_at);

COMMIT;
