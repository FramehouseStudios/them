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
import { createPostgresPersistence } from "../lib/persistence_postgres.js";

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
        const value = JSON.parse(params[1]);
        tbl.set(params[0], { value, updated_at: new Date() });
        return { rowCount: 1 };
      }
      // DELETE one
      m = trimmed.match(/^DELETE FROM (\w+) WHERE key = \$1$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const had = tbl.delete(params[0]);
        return { rowCount: had ? 1 : 0 };
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

test("KNOWN_DOMAINS includes the canonical domains (T07 four + T22 craft pair + T21 follow-up classifications cache)", () => {
  assert.deepEqual(
    [...KNOWN_DOMAINS].sort(),
    [
      "craft_classifications",
      "craft_overrides",
      "craft_reports",
      "knowledge_embeddings",
      "outbox",
      "screenplay",
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
