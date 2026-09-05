-- User-scoped canonical password-reset and session-revocation lookups use
-- WHERE value->>'userId' = $1 while holding the user's advisory lock.
-- Index both predicates so one writer's mutation does not scan every account.
-- Keep the existing 012 wallet/IAP migration immutable.

BEGIN;

CREATE INDEX IF NOT EXISTS persistence_auth_sessions_user_id_idx
    ON persistence_auth_sessions ((value->>'userId'));
CREATE INDEX IF NOT EXISTS persistence_auth_password_reset_tokens_user_id_idx
    ON persistence_auth_password_reset_tokens ((value->>'userId'));

COMMIT;
