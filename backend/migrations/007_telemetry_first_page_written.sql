-- backend/migrations/007_telemetry_first_page_written.sql
--
-- T-first-page-telemetry-sink: server-side sink for the first-page-
-- written event. One row per userId (idempotent on re-submission).

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_telemetry_first_page_written (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_telemetry_first_page_written_updated_at_idx
    ON persistence_telemetry_first_page_written (updated_at);

COMMIT;
