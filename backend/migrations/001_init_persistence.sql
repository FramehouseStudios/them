-- backend/migrations/001_init_persistence.sql
--
-- Initial schema for the canonical persistence layer (T07).
-- One table per domain. Each row is (key, value, updated_at).
-- Apply with `node scripts/migrate_stores_to_postgres.mjs --schema-only`
-- or via your preferred migration tool. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_outbox (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persistence_user_memory (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persistence_screenplay (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persistence_knowledge_embeddings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Updated-at indexes for cleanup and observability.
CREATE INDEX IF NOT EXISTS persistence_outbox_updated_at_idx
    ON persistence_outbox (updated_at);
CREATE INDEX IF NOT EXISTS persistence_user_memory_updated_at_idx
    ON persistence_user_memory (updated_at);
CREATE INDEX IF NOT EXISTS persistence_screenplay_updated_at_idx
    ON persistence_screenplay (updated_at);
CREATE INDEX IF NOT EXISTS persistence_knowledge_embeddings_updated_at_idx
    ON persistence_knowledge_embeddings (updated_at);

COMMIT;
