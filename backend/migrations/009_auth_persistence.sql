-- backend/migrations/009_auth_persistence.sql
--
-- Durable auth persistence domains. These replace user_store.json as the
-- production source for users, refresh sessions, and one-time auth tokens.
-- The application still dual-writes the legacy JSON file for local fallback.

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_auth_users (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persistence_auth_sessions (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persistence_auth_password_reset_tokens (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persistence_auth_email_verification_tokens (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS persistence_auth_users_updated_at_idx
    ON persistence_auth_users (updated_at);
CREATE INDEX IF NOT EXISTS persistence_auth_sessions_updated_at_idx
    ON persistence_auth_sessions (updated_at);
CREATE INDEX IF NOT EXISTS persistence_auth_password_reset_tokens_updated_at_idx
    ON persistence_auth_password_reset_tokens (updated_at);
CREATE INDEX IF NOT EXISTS persistence_auth_email_verification_tokens_updated_at_idx
    ON persistence_auth_email_verification_tokens (updated_at);

COMMIT;
