-- backend/migrations/011_provider_spend.sql
--
-- Durable per-user daily provider-spend accounting. Upgrades provider_budget
-- from an in-memory request counter (which reset on restart and did not span
-- instances) into a persisted estimated-dollar ledger, so a per-user daily $
-- cap can actually bound OpenAI/ElevenLabs spend across restarts and instances.
-- One row per key "${identity}:${utcDayMs}", value { usd, turns, updatedAt }.
--
-- Transaction control is owned by the migration runner
-- (backend/scripts/apply_migrations.mjs), which wraps this file and its
-- _schema_migrations tracking row in a single transaction. The BEGIN/COMMIT
-- here match the existing migration house style and are stripped by the runner.

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_provider_spend (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_provider_spend_updated_at_idx
    ON persistence_provider_spend (updated_at);

COMMIT;
