-- backend/migrations/012_wallet_iap_persistence.sql
--
-- T-wallet-postgres-persistence — durable Clementine wallet balances and
-- IAP transaction idempotency ledger so credits survive restarts.
--
-- Production path (DATABASE_URL): dedicated tables with UNIQUE(transaction_id)
-- fail-closed double-credit. Process-local reservations remain in-memory
-- (see docs/product/clementine-monetization.md).
--
-- Apply via `node scripts/apply_migrations.mjs`. Idempotent.

BEGIN;

-- Per-owner Companion + Page meters in milliturns (1000 = 1 turn).
CREATE TABLE IF NOT EXISTS wallet_balances (
    owner_id                       TEXT PRIMARY KEY,
    companion_milliturns           BIGINT NOT NULL DEFAULT 0
        CHECK (companion_milliturns >= 0),
    page_milliturns                BIGINT NOT NULL DEFAULT 0
        CHECK (page_milliturns >= 0),
    granted_companion_milliturns   BIGINT NOT NULL DEFAULT 0
        CHECK (granted_companion_milliturns >= 0),
    granted_page_milliturns        BIGINT NOT NULL DEFAULT 0
        CHECK (granted_page_milliturns >= 0),
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_balances_updated_at_idx
    ON wallet_balances (updated_at);

-- App Store / grant transaction ledger. PRIMARY KEY = fail-closed idempotency.
CREATE TABLE IF NOT EXISTS iap_transactions (
    transaction_id              TEXT PRIMARY KEY,
    owner_id                    TEXT NOT NULL,
    pack_id                     TEXT,
    companion_turns_credited    DOUBLE PRECISION NOT NULL DEFAULT 0,
    page_turns_credited         DOUBLE PRECISION NOT NULL DEFAULT 0,
    credited_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_meta                    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS iap_transactions_owner_id_idx
    ON iap_transactions (owner_id, credited_at DESC);

COMMIT;
