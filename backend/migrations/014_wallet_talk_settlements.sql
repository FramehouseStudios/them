-- T-1122: idempotent durable settlement receipts for accepted Page turns.
-- The dedicated table is canonical for the production wallet backend. The
-- persistence_* table supports the existing adapter/JSON-compatible contract.

BEGIN;

CREATE TABLE IF NOT EXISTS wallet_talk_settlements (
    settlement_key          TEXT PRIMARY KEY,
    owner_id                TEXT NOT NULL,
    lane                    TEXT NOT NULL CHECK (lane IN ('companion', 'page')),
    settled_milliturns      BIGINT NOT NULL CHECK (settled_milliturns >= 0),
    actual_output_tokens    BIGINT NOT NULL CHECK (actual_output_tokens >= 0),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_meta                JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS wallet_talk_settlements_owner_id_idx
    ON wallet_talk_settlements (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS persistence_wallet_talk_settlements (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
