-- T-1118: crash-durable accepted /talk replay and metadata recovery.
-- Values are bounded JSON documents governed by the existing persistence
-- adapter and the /talk retention limits; audio is base64 encoded.

BEGIN;

CREATE TABLE IF NOT EXISTS persistence_talk_idempotency (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persistence_talk_turns (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
