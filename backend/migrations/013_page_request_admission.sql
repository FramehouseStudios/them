-- Only owner identity, hashed session/request identity and admission state.
-- No screenplay, transcript, raw session token or expiry-based reopening.
BEGIN;
CREATE TABLE IF NOT EXISTS persistence_page_requests (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
