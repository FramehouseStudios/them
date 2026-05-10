-- backend/migrations/002_craft_persistence.sql
--
-- T22: persistence tables for craft analysis (reports + overrides).
-- Apply on top of 001_init_persistence.sql. Idempotent.
--
-- persistence_craft_reports key: "${projectId}:${versionId || ''}"
--                            value: ScreenplayCraftReport JSON shape
-- persistence_craft_overrides key: override id (UUID)
--                             value: TurnOverride JSON shape

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_craft_reports (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persistence_craft_overrides (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_craft_reports_updated_at_idx
    ON persistence_craft_reports (updated_at);
CREATE INDEX IF NOT EXISTS persistence_craft_overrides_updated_at_idx
    ON persistence_craft_overrides (updated_at);

COMMIT;
