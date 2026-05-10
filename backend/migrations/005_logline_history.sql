-- backend/migrations/005_logline_history.sql
--
-- T-logline-distiller: per-project logline history (Craft Intelligence
-- Suite, Layer 2). One row per `${projectId}:${versionId}:${timestamp}`
-- so each distillation produces a new immutable entry; drift = comparing
-- the latest entry to the earliest.

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_craft_loglines (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_craft_loglines_updated_at_idx
    ON persistence_craft_loglines (updated_at);

COMMIT;
