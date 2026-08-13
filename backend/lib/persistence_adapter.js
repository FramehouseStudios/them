// Persistence adapter — canonical interface for backend stores.
//
// Stores (memory_store, screenplay_store, outbox_store, knowledge
// embeddings cache) all want the same primitive operations on JSON
// documents keyed by string ID, scoped to a "domain" (logical table).
//
// Two implementations live alongside this interface:
//   - persistence_json.js     — file-backed; default for local dev.
//   - persistence_postgres.js — pg-backed; default in CI / prod.
//
// Adapter selection is driven by DATABASE_URL: present → Postgres,
// absent → JSON. A single createPersistence() factory returns the
// correct one. Both adapters also expose compareAndSwap so durable
// read-modify-write operations can reject stale writers across instances.
// All stores accept a persistence handle via DI; no store imports either
// implementation directly.
//
// Both implementations satisfy the same contract, exercised by
// backend/tests/persistence_adapter.test.mjs.

import { createJsonPersistence } from "./persistence_json.js";
import { createPostgresPersistence } from "./persistence_postgres.js";

const KNOWN_DOMAINS = Object.freeze([
  "auth_users",
  "auth_sessions",
  "auth_password_reset_tokens",
  "auth_email_verification_tokens",
  "outbox",
  "user_memory",
  "screenplay",
  "knowledge_embeddings",
  // T22: craft analysis domains.
  "craft_reports",
  "craft_overrides",
  // T21 follow-up: per-scene classifier cache keyed by content hash.
  "craft_classifications",
  // T08-postgres: creative-companion memory tier.
  "creative_memory",
  // T-logline-distiller: per-project logline history (Craft Intelligence Suite, Layer 2).
  "craft_loglines",
  // T-accepted-twist-log: per-project accepted-twist log (Craft Intelligence Suite, Layer 2 follow-up).
  "accepted_twists",
  // T-first-page-telemetry-sink: per-user first-page-written events for measuring the T11 magic-moment SLA.
  "telemetry_first_page_written",
  "account_lifecycle",
  "account_audit_log",
]);

function isKnownDomain(domain) {
  return KNOWN_DOMAINS.includes(domain);
}

function assertDomain(domain) {
  if (!isKnownDomain(domain)) {
    throw new Error(`unknown persistence domain: ${domain}`);
  }
}

function assertKey(key) {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("persistence key must be a non-empty string");
  }
  if (key.length > 512) {
    throw new Error("persistence key must be <= 512 characters");
  }
}

function assertValue(value) {
  if (value === undefined) {
    throw new Error("persistence value cannot be undefined; use null to represent absence");
  }
  // JSON.stringify will throw on circular refs; let it.
  JSON.stringify(value);
}

// Factory. Reads env if config not passed.
function createPersistence({
  databaseUrl = process.env.DATABASE_URL || "",
  jsonRoot = process.env.PERSISTENCE_JSON_ROOT || "",
  pgClient = null, // for tests — caller may supply a mock pg-shaped client
} = {}) {
  if (databaseUrl || pgClient) {
    return createPostgresPersistence({ databaseUrl, pgClient });
  }
  return createJsonPersistence({ jsonRoot });
}

export {
  KNOWN_DOMAINS,
  isKnownDomain,
  assertDomain,
  assertKey,
  assertValue,
  createPersistence,
};
