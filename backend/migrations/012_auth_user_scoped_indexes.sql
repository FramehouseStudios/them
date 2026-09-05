-- backend/migrations/012_auth_user_scoped_indexes.sql
--
-- User-scoped lookups for canonical auth mutations.
--
-- Password-reset completion and user-wide session revocation select every
-- session and reset token for one user (WHERE value->>'userId' = $1) while
-- holding that user's advisory transaction lock and FOR UPDATE row locks.
-- Without an expression index those statements scan the whole table on every
-- reset and revoke-all. Email verification tokens are not queried by user and
-- are intentionally left alone. Idempotent; apply on top of 011.

BEGIN;

CREATE INDEX IF NOT EXISTS persistence_auth_sessions_user_id_idx
    ON persistence_auth_sessions ((value->>'userId'));
CREATE INDEX IF NOT EXISTS persistence_auth_password_reset_tokens_user_id_idx
    ON persistence_auth_password_reset_tokens ((value->>'userId'));

COMMIT;
