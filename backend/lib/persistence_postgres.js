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

// T-backend-pg-pool-tuning. pg.Pool defaults are max=10 with no idle
// timeout and no application_name; a production pool needs all three
// bounded and visible. Every value is env-driven; the defaults are what a
// single backend instance on a managed Postgres can hold.
function boundedInt(value, fallback, min, max) {
  const parsed = Number(value);
  const resolved = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  return Math.max(min, Math.min(max, resolved));
}

function applicationName(build) {
  const clean = String(build || "").trim().replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40) || "dev";
  // application_name is limited to 63 bytes on the server side.
  return `them-backend@${clean}`;
}

function buildPostgresPoolConfig({
  databaseUrl,
  connectionTimeoutMs = process.env.PERSISTENCE_POSTGRES_CONNECTION_TIMEOUT_MS,
  statementTimeoutMs = process.env.PERSISTENCE_POSTGRES_STATEMENT_TIMEOUT_MS,
  queryTimeoutMs = process.env.PERSISTENCE_POSTGRES_QUERY_TIMEOUT_MS,
  poolMax = process.env.PERSISTENCE_POSTGRES_POOL_MAX,
  idleTimeoutMs = process.env.PERSISTENCE_POSTGRES_IDLE_TIMEOUT_MS,
  build = process.env.BACKEND_BUILD || process.env.RENDER_GIT_COMMIT || process.env.FLY_IMAGE_REF || "",
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
    max: boundedInt(poolMax, 10, 1, 100),
    idleTimeoutMillis: boundedInt(idleTimeoutMs, 30_000, 1_000, 600_000),
    application_name: applicationName(build),
  };
}

async function loadPgClient(poolConfig, { createPool, logger = console } = {}) {
  // Lazy import so test environments without pg installed can still
  // exercise the JSON adapter.
  let pool;
  if (typeof createPool === "function") {
    pool = createPool(poolConfig);
  } else {
    const pgModule = await import("pg");
    const { Pool } = pgModule.default ?? pgModule;
    pool = new Pool(poolConfig);
  }
  // An idle client that loses its connection emits "error" on the pool.
  // Without a listener that is an unhandled event: the process exits.
  let errorCount = 0;
  let lastError = "";
  pool.on?.("error", (err) => {
    errorCount += 1;
    lastError = String(err?.message || err).slice(0, 200);
    logger?.warn?.(`[persistence] pg pool idle client error count=${errorCount} ${lastError}`);
  });
  return {
    query: (...args) => pool.query(...args),
    end: () => pool.end(),
    stats: () => ({
      total: Number(pool.totalCount ?? 0),
      idle: Number(pool.idleCount ?? 0),
      waiting: Number(pool.waitingCount ?? 0),
      max: Number(poolConfig.max ?? 0),
      errors: errorCount,
      last_error: lastError,
    }),
  };
}

function createPostgresPersistence({
  databaseUrl,
  pgClient,
  connectionTimeoutMs,
  statementTimeoutMs,
  queryTimeoutMs,
  poolMax,
  idleTimeoutMs,
  build,
  createPool,
  logger = console,
} = {}) {
  let clientPromise = null;
  let loadedClient = null;
  const poolConfig = buildPostgresPoolConfig({
    databaseUrl,
    connectionTimeoutMs,
    statementTimeoutMs,
    queryTimeoutMs,
    ...(poolMax !== undefined ? { poolMax } : {}),
    ...(idleTimeoutMs !== undefined ? { idleTimeoutMs } : {}),
    ...(build !== undefined ? { build } : {}),
  });

  async function client() {
    if (pgClient) return pgClient;
    if (!clientPromise) {
      if (!databaseUrl) {
        throw new Error("createPostgresPersistence requires databaseUrl or pgClient");
      }
      clientPromise = loadPgClient(poolConfig, { createPool, logger }).then((c) => {
        loadedClient = c;
        return c;
      });
    }
    return clientPromise;
  }

  return {
    kind: "postgres",
    databaseUrl,
    poolConfig,

    // Pool health for /ops/metrics. Synchronous and never opens the pool:
    // before the first query it reports the configured limits only.
    poolStats() {
      const base = {
        kind: "postgres",
        max: poolConfig.max,
        idle_timeout_ms: poolConfig.idleTimeoutMillis,
        connection_timeout_ms: poolConfig.connectionTimeoutMillis,
        statement_timeout_ms: poolConfig.statement_timeout,
        application_name: poolConfig.application_name,
        loaded: Boolean(loadedClient),
      };
      if (!loadedClient || typeof loadedClient.stats !== "function") return base;
      return { ...base, ...loadedClient.stats() };
    },

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
  loadPgClient,
  tableName,
  KNOWN_DOMAINS,
};
