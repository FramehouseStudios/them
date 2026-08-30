-- backend/migrations/011_auth_store_metadata.sql
--
-- Creates storage for the canonical auth initialization marker.
--
-- Schema installation cannot distinguish a virgin empty database that still
-- needs a legacy import from an intentionally empty canonical store. It may
-- safely mark an existing nonempty auth store; an empty store remains
-- uninitialized until the validated exact-import transaction publishes the
-- marker, and production startup fails closed until that happens.

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_auth_store_meta (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO persistence_auth_store_meta (key, value, updated_at)
SELECT
    'canonical_state',
    '{"schemaVersion":1,"initialized":true}'::jsonb,
    NOW()
WHERE EXISTS (
    SELECT 1 FROM persistence_auth_users
    UNION ALL
    SELECT 1 FROM persistence_auth_sessions
    UNION ALL
    SELECT 1 FROM persistence_auth_password_reset_tokens
    UNION ALL
    SELECT 1 FROM persistence_auth_email_verification_tokens
)
-- A later migration may raise the marker schema. Replaying this migration must
-- never silently downgrade that newer value.
ON CONFLICT (key) DO NOTHING;

COMMIT;
