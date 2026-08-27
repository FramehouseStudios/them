// Adapter contract tests. The same suite runs against both the JSON
// and Postgres implementations. The Postgres implementation uses an
// in-memory pg-shaped mock so the test runs without a live database.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  KNOWN_DOMAINS,
  isKnownDomain,
  createPersistence,
  assertKey,
} from "../lib/persistence_adapter.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import {
  buildPostgresPoolConfig,
  createPostgresPersistence,
} from "../lib/persistence_postgres.js";

// ---------- in-memory pg-shaped mock ----------

function createPgMock() {
  const tables = new Map(); // tableName -> Map(key -> { value, updated_at })
  function ensure(t) {
    if (!tables.has(t)) tables.set(t, new Map());
    return tables.get(t);
  }
  return {
    async query(sql, params = []) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      // SELECT one
      let m = trimmed.match(/^SELECT value FROM (\w+) WHERE key = \$1$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const row = tbl.get(params[0]);
        return { rows: row ? [{ value: row.value }] : [] };
      }
      // UPSERT
      m = trimmed.match(/^INSERT INTO (\w+) \(key, value, updated_at\)/i);
      if (m) {
        const tbl = ensure(m[1]);
        if (/ON CONFLICT \(key\) DO NOTHING RETURNING key$/i.test(trimmed)) {
          if (tbl.has(params[0])) return { rows: [], rowCount: 0 };
          const value = JSON.parse(params[1]);
          tbl.set(params[0], { value, updated_at: new Date() });
          return { rows: [{ key: params[0] }], rowCount: 1 };
        }
        const value = JSON.parse(params[1]);
        tbl.set(params[0], { value, updated_at: new Date() });
        return { rowCount: 1 };
      }
      // Compare-and-swap update
      m = trimmed.match(/^UPDATE (\w+) SET value = \$3::jsonb, updated_at = NOW\(\) WHERE key = \$1 AND value = \$2::jsonb RETURNING key$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const row = tbl.get(params[0]);
        const expected = JSON.parse(params[1]);
        if (!row || JSON.stringify(row.value) !== JSON.stringify(expected)) {
          return { rows: [], rowCount: 0 };
        }
        row.value = JSON.parse(params[2]);
        row.updated_at = new Date();
        return { rows: [{ key: params[0] }], rowCount: 1 };
      }
      // DELETE one
      m = trimmed.match(/^DELETE FROM (\w+) WHERE key = \$1$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const had = tbl.delete(params[0]);
        return { rowCount: had ? 1 : 0 };
      }
      // LIST with prefix + cursor
      m = trimmed.match(/^SELECT key, value FROM (\w+) WHERE key LIKE \$1 AND key > \$2 ORDER BY key ASC LIMIT \$3$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const rawPrefix = String(params[0]).replace(/%$/, "");
        const afterKey = String(params[1]);
        const cap = Number(params[2]);
        const rows = [...tbl.entries()]
          .filter(([k]) => k.startsWith(rawPrefix) && k > afterKey)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, cap)
          .map(([key, { value }]) => ({ key, value }));
        return { rows };
      }
      // LIST with prefix
      m = trimmed.match(/^SELECT key, value FROM (\w+) WHERE key LIKE \$1 ORDER BY key ASC LIMIT \$2$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const rawPrefix = String(params[0]).replace(/%$/, "");
        const cap = Number(params[1]);
        const rows = [...tbl.entries()]
          .filter(([k]) => k.startsWith(rawPrefix))
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, cap)
          .map(([key, { value }]) => ({ key, value }));
        return { rows };
      }
      // LIST with cursor
      m = trimmed.match(/^SELECT key, value FROM (\w+) WHERE key > \$1 ORDER BY key ASC LIMIT \$2$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const afterKey = String(params[0]);
        const cap = Number(params[1]);
        const rows = [...tbl.entries()]
          .filter(([k]) => k > afterKey)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, cap)
          .map(([key, { value }]) => ({ key, value }));
        return { rows };
      }
      // LIST no prefix
      m = trimmed.match(/^SELECT key, value FROM (\w+) ORDER BY key ASC LIMIT \$1$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const cap = Number(params[0]);
        const rows = [...tbl.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, cap)
          .map(([key, { value }]) => ({ key, value }));
        return { rows };
      }
      // CLEAR
      m = trimmed.match(/^DELETE FROM (\w+)$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const n = tbl.size;
        tbl.clear();
        return { rowCount: n };
      }
      throw new Error(`pg-mock: unrecognized SQL: ${trimmed}`);
    },
    async end() { /* no-op */ },
  };
}

// ---------- per-implementation factories ----------

function freshTempJsonRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "io-them-persistence-"));
}

function makeImplementations() {
  return [
    {
      name: "json",
      create: () => createJsonPersistence({ jsonRoot: freshTempJsonRoot() }),
    },
    {
      name: "postgres-mock",
      create: () => createPostgresPersistence({ pgClient: createPgMock() }),
    },
  ];
}

test("[postgres] pool deadlines bound acquisition, server execution, and client reads", () => {
  const defaults = buildPostgresPoolConfig({ databaseUrl: "postgres://example/test" });
  assert.equal(defaults.connectionString, "postgres://example/test");
  assert.equal(defaults.connectionTimeoutMillis, 1_000);
  assert.equal(defaults.statement_timeout, 3_000);
  assert.equal(defaults.query_timeout, 3_500);
  assert.ok(defaults.statement_timeout < defaults.query_timeout);
  assert.ok(defaults.connectionTimeoutMillis + defaults.query_timeout < 5_000);

  const clamped = buildPostgresPoolConfig({
    databaseUrl: "postgres://example/test",
    connectionTimeoutMs: -1,
    statementTimeoutMs: 40_000,
    queryTimeoutMs: 1,
  });
  assert.equal(clamped.connectionTimeoutMillis, 1_000);
  assert.equal(clamped.statement_timeout, 29_000);
  assert.equal(clamped.query_timeout, 29_100);
  assert.ok(clamped.statement_timeout < clamped.query_timeout);
});

// ---------- contract tests, run against both impls ----------

for (const impl of makeImplementations()) {
  test(`[${impl.name}] put → get round-trips a JSON document`, async () => {
    const p = impl.create();
    try {
      await p.put({ domain: "outbox", key: "k1", value: { hello: "world", n: 7 } });
      const v = await p.get({ domain: "outbox", key: "k1" });
      assert.deepEqual(v, { hello: "world", n: 7 });
    } finally {
      await p.close();
    }
  });

  test(`[${impl.name}] get on missing key returns null, not throws`, async () => {
    const p = impl.create();
    try {
      const v = await p.get({ domain: "outbox", key: "nope" });
      assert.equal(v, null);
    } finally {
      await p.close();
    }
  });

  test(`[${impl.name}] compareAndSwap rejects stale writers without replacing the winner`, async () => {
    const p = impl.create();
    try {
      const initial = { revision: 1, story: "Mara waits." };
      const winner = { revision: 2, story: "Mara goes back." };
      const stale = { revision: 2, story: "Mara leaves." };
      assert.equal(await p.compareAndSwap({
        domain: "creative_memory",
        key: "writer-1",
        expectedValue: null,
        value: initial,
      }), true);
      assert.equal(await p.compareAndSwap({
        domain: "creative_memory",
        key: "writer-1",
        expectedValue: initial,
        value: winner,
      }), true);
      assert.equal(await p.compareAndSwap({
        domain: "creative_memory",
        key: "writer-1",
        expectedValue: initial,
        value: stale,
      }), false);
      assert.deepEqual(
        await p.get({ domain: "creative_memory", key: "writer-1" }),
        winner,
      );
    } finally {
      await p.close();
    }
  });

  test(`[${impl.name}] delete removes a key; subsequent get returns null`, async () => {
    const p = impl.create();
    try {
      await p.put({ domain: "outbox", key: "x", value: { a: 1 } });
      await p.delete({ domain: "outbox", key: "x" });
      assert.equal(await p.get({ domain: "outbox", key: "x" }), null);
    } finally {
      await p.close();
    }
  });

  test(`[${impl.name}] list returns sorted records, prefix filtered`, async () => {
    const p = impl.create();
    try {
      await p.put({ domain: "user_memory", key: "byUserId:zebra", value: { z: true } });
      await p.put({ domain: "user_memory", key: "byUserId:alpha", value: { a: true } });
      await p.put({ domain: "user_memory", key: "byIp:1.2.3.4", value: { ip: true } });
      const userOnly = await p.list({ domain: "user_memory", prefix: "byUserId:" });
      assert.deepEqual(userOnly.map((r) => r.key), ["byUserId:alpha", "byUserId:zebra"]);
      const all = await p.list({ domain: "user_memory" });
      assert.equal(all.length, 3);
      const afterFirst = await p.list({ domain: "user_memory", afterKey: all[0].key });
      assert.deepEqual(afterFirst.map((r) => r.key), all.slice(1).map((r) => r.key));
      const prefixedAfterFirst = await p.list({
        domain: "user_memory",
        prefix: "byUserId:",
        afterKey: "byUserId:alpha",
      });
      assert.deepEqual(prefixedAfterFirst.map((r) => r.key), ["byUserId:zebra"]);
    } finally {
      await p.close();
    }
  });

  test(`[${impl.name}] put rejects unknown domain`, async () => {
    const p = impl.create();
    try {
      await assert.rejects(
        () => p.put({ domain: "bogus", key: "k", value: {} }),
        /unknown persistence domain/,
      );
    } finally {
      await p.close();
    }
  });

  test(`[${impl.name}] put rejects empty key`, async () => {
    const p = impl.create();
    try {
      await assert.rejects(
        () => p.put({ domain: "outbox", key: "", value: {} }),
        /persistence key/,
      );
    } finally {
      await p.close();
    }
  });

  test(`[${impl.name}] put rejects undefined value`, async () => {
    const p = impl.create();
    try {
      await assert.rejects(
        () => p.put({ domain: "outbox", key: "x", value: undefined }),
        /persistence value cannot be undefined/,
      );
    } finally {
      await p.close();
    }
  });

  test(`[${impl.name}] clear empties a single domain only`, async () => {
    const p = impl.create();
    try {
      await p.put({ domain: "outbox", key: "k", value: { kept: false } });
      await p.put({ domain: "screenplay", key: "k", value: { kept: true } });
      await p.clear({ domain: "outbox" });
      assert.equal(await p.get({ domain: "outbox", key: "k" }), null);
      assert.deepEqual(await p.get({ domain: "screenplay", key: "k" }), { kept: true });
    } finally {
      await p.close();
    }
  });
}

// ---------- module-level invariants ----------

test("KNOWN_DOMAINS includes the canonical domains", () => {
  assert.deepEqual(
    [...KNOWN_DOMAINS].sort(),
    [
      "accepted_twists",
      "account_audit_log",
      "account_lifecycle",
      "auth_email_verification_tokens",
      "auth_password_reset_tokens",
      "auth_sessions",
      "auth_store_meta",
      "auth_users",
      "craft_classifications",
      "craft_loglines",
      "craft_overrides",
      "craft_reports",
      "creative_memory",
      "knowledge_embeddings",
      "outbox",
      "screenplay",
      "telemetry_first_page_written",
      "user_memory",
    ],
  );
});

test("isKnownDomain returns false for unknown domains", () => {
  assert.equal(isKnownDomain("nope"), false);
  assert.equal(isKnownDomain("outbox"), true);
});

test("createPersistence with no env or args returns json adapter", () => {
  const old = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const p = createPersistence({ jsonRoot: freshTempJsonRoot() });
    assert.equal(p.kind, "json");
  } finally {
    if (old !== undefined) process.env.DATABASE_URL = old;
  }
});

test("createPersistence with pgClient returns postgres adapter", () => {
  const p = createPersistence({ pgClient: createPgMock() });
  assert.equal(p.kind, "postgres");
});

test("assertKey rejects non-strings and over-long strings", () => {
  assert.throws(() => assertKey(123), /non-empty string/);
  assert.throws(() => assertKey(""), /non-empty string/);
  assert.throws(() => assertKey("x".repeat(513)), /<= 512/);
  assertKey("ok"); // does not throw
});
