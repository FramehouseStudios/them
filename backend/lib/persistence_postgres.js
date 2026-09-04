// Postgres-backed persistence adapter.
//
// One table per domain: persistence_<domain>. Each row is
// (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ).
//
// The adapter accepts either a connection URL (DATABASE_URL) or a
// pre-built pg-shaped client (for tests). It does NOT auto-create
// tables — schema lives in backend/migrations/001_init.sql and is
// applied via the migration script. Production deploys must run
// migrations before booting the backend.

import {
  KNOWN_DOMAINS,
  assertDomain,
  assertKey,
  assertValue,
} from "./persistence_adapter.js";

function tableName(domain) {
  assertDomain(domain);
  return `persistence_${domain}`;
}

function escapeLikePrefix(prefix) {
  return String(prefix).replace(/[\\%_]/g, "\\$&");
}

function boundedTimeout(value, fallback, min, max) {
  const parsed = Number(value);
  const resolved = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  return Math.max(min, Math.min(max, resolved));
}

function buildPostgresPoolConfig({
  databaseUrl,
  connectionTimeoutMs = process.env.PERSISTENCE_POSTGRES_CONNECTION_TIMEOUT_MS,
  statementTimeoutMs = process.env.PERSISTENCE_POSTGRES_STATEMENT_TIMEOUT_MS,
  queryTimeoutMs = process.env.PERSISTENCE_POSTGRES_QUERY_TIMEOUT_MS,
} = {}) {
  const connectionTimeoutMillis = boundedTimeout(connectionTimeoutMs, 1_000, 100, 10_000);
  const statement_timeout = boundedTimeout(statementTimeoutMs, 3_000, 250, 29_000);
  const requestedQueryTimeout = boundedTimeout(queryTimeoutMs, 3_500, 300, 30_000);
  const query_timeout = Math.max(statement_timeout + 100, requestedQueryTimeout);
  return {
    connectionString: databaseUrl,
    connectionTimeoutMillis,
    statement_timeout,
    query_timeout,
  };
}

async function loadPgClient(poolConfig) {
  // Lazy import so test environments without pg installed can still
  // exercise the JSON adapter.
  const pgModule = await import("pg");
  const { Pool } = pgModule.default ?? pgModule;
  const pool = new Pool(poolConfig);
  return {
    query: (...args) => pool.query(...args),
    connect: () => pool.connect(),
    end: () => pool.end(),
  };
}

function assertAuthSessionRotation(expectedSession, previousSession, nextSession) {
  for (const [label, value] of [
    ["expectedSession", expectedSession],
    ["previousSession", previousSession],
    ["nextSession", nextSession],
  ]) {
    assertValue(value);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`auth session rotation ${label} must be an object`);
    }
  }
  const currentSessionId = String(expectedSession.sessionId || "").trim();
  const previousSessionId = String(previousSession.sessionId || "").trim();
  const nextSessionId = String(nextSession.sessionId || "").trim();
  const currentUserId = String(expectedSession.userId || "").trim();
  const currentFamilyId = String(expectedSession.familyId || "").trim();
  if (!currentSessionId || previousSessionId !== currentSessionId) {
    throw new Error("auth session rotation must replace the expected session row");
  }
  if (!nextSessionId || nextSessionId === currentSessionId) {
    throw new Error("auth session rotation requires a distinct replacement session");
  }
  if (
    !currentUserId
    || String(previousSession.userId || "").trim() !== currentUserId
    || String(nextSession.userId || "").trim() !== currentUserId
  ) {
    throw new Error("auth session rotation cannot cross users");
  }
  if (
    !currentFamilyId
    || String(previousSession.familyId || "").trim() !== currentFamilyId
    || String(nextSession.familyId || "").trim() !== currentFamilyId
  ) {
    throw new Error("auth session rotation cannot cross session families");
  }
  if (String(previousSession.replacedBySessionId || "").trim() !== nextSessionId) {
    throw new Error("auth session rotation replacement link is inconsistent");
  }
  if (
    Number(expectedSession.revokedAt || 0) > 0
    || String(expectedSession.replacedBySessionId || "").trim()
    || String(previousSession.tokenHash || "").trim() !== String(expectedSession.tokenHash || "").trim()
    || !String(nextSession.tokenHash || "").trim()
    || String(nextSession.tokenHash || "").trim() === String(expectedSession.tokenHash || "").trim()
  ) {
    throw new Error("auth session rotation requires a fresh replacement token");
  }
  if (Number(previousSession.revokedAt || 0) <= 0 || Number(nextSession.revokedAt || 0) > 0) {
    throw new Error("auth session rotation requires a revoked predecessor and active replacement");
  }
}

function createPostgresPersistence({
  databaseUrl,
  pgClient,
  connectionTimeoutMs,
  statementTimeoutMs,
  queryTimeoutMs,
} = {}) {
  let clientPromise = null;
  const poolConfig = buildPostgresPoolConfig({
    databaseUrl,
    connectionTimeoutMs,
    statementTimeoutMs,
    queryTimeoutMs,
  });

  async function client() {
    if (pgClient) return pgClient;
    if (!clientPromise) {
      if (!databaseUrl) {
        throw new Error("createPostgresPersistence requires databaseUrl or pgClient");
      }
      clientPromise = loadPgClient(poolConfig);
    }
    return clientPromise;
  }

  return {
    kind: "postgres",
    databaseUrl,
    poolConfig,

    // Readiness probe for /healthz. Cheapest possible round-trip; just
    // confirms the connection pool can reach the database.
    async ping() {
      const c = await client();
      const r = await c.query("SELECT 1 AS ok");
      return r?.rows?.[0]?.ok === 1;
    },

    async query(...args) {
      const c = await client();
      return c.query(...args);
    },

    async get({ domain, key }) {
      assertDomain(domain);
      assertKey(key);
      const c = await client();
      const r = await c.query(
        `SELECT value FROM ${tableName(domain)} WHERE key = $1`,
        [key],
      );
      if (!r.rows || r.rows.length === 0) return null;
      return r.rows[0].value;
    },

    async put({ domain, key, value }) {
      assertDomain(domain);
      assertKey(key);
      assertValue(value);
      const c = await client();
      await c.query(
        `INSERT INTO ${tableName(domain)} (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, JSON.stringify(value)],
      );
    },

    async compareAndSwap({ domain, key, expectedValue, value }) {
      assertDomain(domain);
      assertKey(key);
      assertValue(expectedValue);
      assertValue(value);
      const c = await client();
      let r;
      if (expectedValue === null) {
        r = await c.query(
          `INSERT INTO ${tableName(domain)} (key, value, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO NOTHING
           RETURNING key`,
          [key, JSON.stringify(value)],
        );
      } else {
        r = await c.query(
          `UPDATE ${tableName(domain)}
           SET value = $3::jsonb, updated_at = NOW()
           WHERE key = $1 AND value = $2::jsonb
           RETURNING key`,
          [key, JSON.stringify(expectedValue), JSON.stringify(value)],
        );
      }
      return Number(r?.rowCount || r?.rows?.length || 0) === 1;
    },

    async rotateAuthSession({ expectedSession, previousSession, nextSession }) {
      assertAuthSessionRotation(expectedSession, previousSession, nextSession);
      const c = await client();
      const transactionClient = typeof c.connect === "function"
        ? await c.connect()
        : c;
      if (!transactionClient || typeof transactionClient.query !== "function") {
        throw new Error("Postgres auth session rotation requires a query-capable transaction client");
      }
      let transactionOpen = false;
      let commitAttempted = false;
      try {
        await transactionClient.query("BEGIN");
        transactionOpen = true;
        const replaced = await transactionClient.query(
          `UPDATE ${tableName("auth_sessions")}
           SET value = $3::jsonb, updated_at = NOW()
           WHERE key = $1 AND value = $2::jsonb
           RETURNING key`,
          [
            expectedSession.sessionId,
            JSON.stringify(expectedSession),
            JSON.stringify(previousSession),
          ],
        );
        if (Number(replaced?.rowCount || replaced?.rows?.length || 0) !== 1) {
          await transactionClient.query("ROLLBACK");
          transactionOpen = false;
          return false;
        }
        const inserted = await transactionClient.query(
          `INSERT INTO ${tableName("auth_sessions")} (key, value, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO NOTHING
           RETURNING key`,
          [nextSession.sessionId, JSON.stringify(nextSession)],
        );
        if (Number(inserted?.rowCount || inserted?.rows?.length || 0) !== 1) {
          const conflict = new Error("auth session replacement row already exists");
          conflict.code = "AUTH_SESSION_REPLACEMENT_CONFLICT";
          throw conflict;
        }
        commitAttempted = true;
        await transactionClient.query("COMMIT");
        transactionOpen = false;
        return true;
      } catch (error) {
        if (commitAttempted && error && (typeof error === "object" || typeof error === "function")) {
          error.commitOutcomeUnknown = true;
        }
        if (transactionOpen) {
          try {
            await transactionClient.query("ROLLBACK");
          } catch (rollbackError) {
            if (error && (typeof error === "object" || typeof error === "function")) {
              error.rollbackError = rollbackError;
            }
          }
        }
        throw error;
      } finally {
        if (transactionClient !== c && typeof transactionClient.release === "function") {
          transactionClient.release();
        }
      }
    },

    async delete({ domain, key }) {
      assertDomain(domain);
      assertKey(key);
      const c = await client();
      await c.query(
        `DELETE FROM ${tableName(domain)} WHERE key = $1`,
        [key],
      );
    },

    async list({ domain, prefix = "", afterKey = "", limit = 1000 }) {
      assertDomain(domain);
      const c = await client();
      const cap = Math.max(1, Math.min(10_000, Math.floor(Number(limit) || 1000)));
      const escapedPrefixPattern = prefix ? `${escapeLikePrefix(prefix)}%` : "";
      let r;
      if (prefix && afterKey) {
        r = await c.query(
          `SELECT key, value FROM ${tableName(domain)}
           WHERE key LIKE $1 ESCAPE E'\\\\' AND key > $2
           ORDER BY key ASC
           LIMIT $3`,
          [escapedPrefixPattern, afterKey, cap],
        );
      } else if (prefix) {
        r = await c.query(
          `SELECT key, value FROM ${tableName(domain)}
           WHERE key LIKE $1 ESCAPE E'\\\\'
           ORDER BY key ASC
           LIMIT $2`,
          [escapedPrefixPattern, cap],
        );
      } else if (afterKey) {
        r = await c.query(
          `SELECT key, value FROM ${tableName(domain)}
           WHERE key > $1
           ORDER BY key ASC
           LIMIT $2`,
          [afterKey, cap],
        );
      } else {
        r = await c.query(
          `SELECT key, value FROM ${tableName(domain)}
           ORDER BY key ASC
           LIMIT $1`,
          [cap],
        );
      }
      return (r.rows || []).map((row) => ({ key: row.key, value: row.value }));
    },

    async clear({ domain }) {
      assertDomain(domain);
      const c = await client();
      await c.query(`DELETE FROM ${tableName(domain)}`);
    },

    async close() {
      if (clientPromise) {
        const c = await clientPromise;
        if (typeof c.end === "function") {
          await c.end();
        }
      }
    },
  };
}

export {
  buildPostgresPoolConfig,
  createPostgresPersistence,
  tableName,
  KNOWN_DOMAINS,
};
