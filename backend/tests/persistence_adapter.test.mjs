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
  function literalPrefix(pattern) {
    const withoutWildcard = String(pattern).endsWith("%")
      ? String(pattern).slice(0, -1)
      : String(pattern);
    return withoutWildcard.replace(/\\([\\%_])/g, "$1");
  }
  return {
    async query(sql, params = []) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(trimmed)) {
        return { rows: [], rowCount: 0 };
      }
      if (/^SELECT pg_advisory_xact_lock\(hashtextextended\(\$1, 7468656d\)\)$/i.test(trimmed)) {
        return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
      }
      // SELECT one
      let m = trimmed.match(/^SELECT value FROM (\w+) WHERE key = \$1$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const row = tbl.get(params[0]);
        return { rows: row ? [{ value: row.value }] : [] };
      }
      m = trimmed.match(/^SELECT value FROM (\w+) WHERE key = \$1 FOR UPDATE$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const row = tbl.get(params[0]);
        return { rows: row ? [{ value: row.value }] : [], rowCount: row ? 1 : 0 };
      }
      m = trimmed.match(/^SELECT value FROM (\w+) WHERE key = \$1 AND value = \$2::jsonb FOR UPDATE$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const row = tbl.get(params[0]);
        const expected = JSON.parse(params[1]);
        const matches = row && JSON.stringify(row.value) === JSON.stringify(expected);
        return { rows: matches ? [{ value: row.value }] : [], rowCount: matches ? 1 : 0 };
      }
      m = trimmed.match(/^SELECT key, value FROM (\w+) WHERE value->>'userId' = \$1 ORDER BY key ASC FOR UPDATE$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const rows = [...tbl.entries()]
          .filter(([, row]) => row.value?.userId === params[0])
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, row]) => ({ key, value: row.value }));
        return { rows, rowCount: rows.length };
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
      m = trimmed.match(/^UPDATE (\w+) SET value = \$3::jsonb, updated_at = NOW\(\) WHERE key = \$1 AND value = \$2::jsonb RETURNING (key|value)$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const row = tbl.get(params[0]);
        const expected = JSON.parse(params[1]);
        if (!row || JSON.stringify(row.value) !== JSON.stringify(expected)) {
          return { rows: [], rowCount: 0 };
        }
        row.value = JSON.parse(params[2]);
        row.updated_at = new Date();
        return {
          rows: [m[2].toLowerCase() === "value" ? { value: row.value } : { key: params[0] }],
          rowCount: 1,
        };
      }
      // DELETE one
      m = trimmed.match(/^DELETE FROM (\w+) WHERE key = \$1$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const had = tbl.delete(params[0]);
        return { rowCount: had ? 1 : 0 };
      }
      // LIST with prefix + cursor
      m = trimmed.match(/^SELECT key, value FROM (\w+) WHERE key LIKE \$1 ESCAPE E'\\\\' AND key > \$2 ORDER BY key ASC LIMIT \$3$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const rawPrefix = literalPrefix(params[0]);
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
      m = trimmed.match(/^SELECT key, value FROM (\w+) WHERE key LIKE \$1 ESCAPE E'\\\\' ORDER BY key ASC LIMIT \$2$/i);
      if (m) {
        const tbl = ensure(m[1]);
        const rawPrefix = literalPrefix(params[0]);
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

test("[postgres] list escapes LIKE metacharacters and declares the escape character", async () => {
  const calls = [];
  const p = createPostgresPersistence({
    pgClient: {
      async query(sql, params) {
        calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        return { rows: [] };
      },
    },
  });

  await p.list({
    domain: "screenplay",
    prefix: "project%_\\",
    afterKey: "project%_\\first",
    limit: 25,
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WHERE key LIKE \$1 ESCAPE E'\\\\' AND key > \$2/);
  assert.equal(calls[0].params[0], "project\\%\\_\\\\%");
  assert.equal(calls[0].params[1], "project%_\\first");
  assert.equal(calls[0].params[2], 25);
});

function authSession({
  sessionId,
  userId = "writer-1",
  familyId = "family-1",
  tokenHash,
  revokedAt = 0,
  replacedBySessionId = "",
} = {}) {
  return {
    sessionId,
    familyId,
    userId,
    tokenHash: tokenHash || `hash-${sessionId}`,
    createdAt: 1_000,
    updatedAt: revokedAt || 1_000,
    expiresAt: 9_000_000_000_000,
    revokedAt,
    replacedBySessionId,
    metadata: {},
  };
}

function authUser({ id = "writer-1", passwordHash = "old-hash", updatedAt = 1_000 } = {}) {
  return {
    id,
    email: `${id}@example.com`,
    name: "",
    authProvider: "password",
    appleSubject: "",
    emailVerified: true,
    emailVerifiedAt: 500,
    password: { salt: "salt", iterations: 600_000, hash: passwordHash },
    createdAt: 500,
    updatedAt,
  };
}

function passwordResetToken({
  tokenHash = "reset-hash",
  userId = "writer-1",
  usedAt = 0,
} = {}) {
  return {
    tokenHash,
    userId,
    createdAt: 1_000,
    expiresAt: 9_000_000_000_000,
    usedAt,
  };
}

test("[postgres] auth issuance inserts one row and leaves unrelated sessions untouched", async () => {
  const p = createPostgresPersistence({ pgClient: createPgMock() });
  const user = { id: "writer-1", email: "writer@example.com" };
  const session = authSession({ sessionId: "session-login" });
  const unrelated = authSession({
    sessionId: "session-login-unrelated",
    userId: "writer-2",
    familyId: "family-2",
  });
  await p.put({ domain: "auth_users", key: user.id, value: user });
  await p.put({ domain: "auth_sessions", key: unrelated.sessionId, value: unrelated });

  const result = await p.issueAuthSession({ userId: user.id, expectedUser: user, session });

  assert.equal(result.status, "committed");
  assert.deepEqual(result.session, session);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: session.sessionId }), session);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: unrelated.sessionId }), unrelated);
});

test("[postgres] auth issuance rejects a conflicting session ID without overwriting its owner", async () => {
  const p = createPostgresPersistence({ pgClient: createPgMock() });
  const user = { id: "writer-1", email: "writer@example.com" };
  const existing = authSession({
    sessionId: "session-login-conflict",
    userId: "writer-2",
    familyId: "family-2",
  });
  const attempted = authSession({ sessionId: existing.sessionId });
  await p.put({ domain: "auth_users", key: user.id, value: user });
  await p.put({ domain: "auth_sessions", key: existing.sessionId, value: existing });

  const result = await p.issueAuthSession({ userId: user.id, expectedUser: user, session: attempted });

  assert.equal(result.status, "conflict");
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: existing.sessionId }), existing);
});

test("[postgres] auth issuance rejects a missing canonical user and cross-user input", async () => {
  const calls = [];
  const pgClient = createPgMock();
  const p = createPostgresPersistence({
    pgClient: {
      async query(sql, params = []) {
        calls.push(sql.replace(/\s+/g, " ").trim());
        return pgClient.query(sql, params);
      },
    },
  });
  const session = authSession({ sessionId: "session-login-missing-user" });

  const missingUser = { id: session.userId, email: "missing@example.com" };
  const missing = await p.issueAuthSession({
    userId: session.userId,
    expectedUser: missingUser,
    session,
  });
  assert.equal(missing.status, "user_missing");
  assert.equal(await p.get({ domain: "auth_sessions", key: session.sessionId }), null);
  const callsBeforeCrossUser = calls.length;
  await assert.rejects(
    p.issueAuthSession({ userId: "writer-2", expectedUser: missingUser, session }),
    /user expectation is inconsistent/,
  );
  assert.equal(calls.length, callsBeforeCrossUser, "cross-user issuance must fail before I/O");
});

test("[postgres] unknown auth issuance COMMIT outcome is unsafe to retry and discards the connection", async () => {
  const user = { id: "writer-1", email: "writer@example.com" };
  const session = authSession({ sessionId: "session-login-unknown-commit" });
  const commitError = new Error("simulated login commit connection loss");
  const calls = [];
  let releasedWith = null;
  const transactionClient = {
    async query(sql) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      calls.push(trimmed);
      if (trimmed === "BEGIN" || trimmed === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (trimmed.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
      }
      if (trimmed.startsWith("SELECT value FROM persistence_auth_users")) {
        return { rows: [{ value: user }], rowCount: 1 };
      }
      if (trimmed.startsWith("INSERT INTO persistence_auth_sessions")) {
        return { rows: [{ key: session.sessionId }], rowCount: 1 };
      }
      if (trimmed === "COMMIT") throw commitError;
      throw new Error(`unexpected SQL: ${trimmed}`);
    },
    release(error) {
      releasedWith = error || null;
    },
  };
  const p = createPostgresPersistence({
    pgClient: {
      async connect() { return transactionClient; },
      async query() { throw new Error("pool query should not be used inside the transaction"); },
    },
  });

  await assert.rejects(
    p.issueAuthSession({ userId: user.id, expectedUser: user, session }),
    (error) => error === commitError && error.commitOutcomeUnknown === true,
  );
  assert.deepEqual(calls.slice(-2), ["COMMIT", "ROLLBACK"]);
  assert.equal(releasedWith, commitError);
});

test("[postgres] auth issuance rolls back a failed insert before reporting failure", async () => {
  const user = { id: "writer-1", email: "writer@example.com" };
  const session = authSession({ sessionId: "session-login-insert-failure" });
  const calls = [];
  const transactionClient = {
    async query(sql) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      calls.push(trimmed);
      if (trimmed === "BEGIN" || trimmed === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (trimmed.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
      }
      if (trimmed.startsWith("SELECT value FROM persistence_auth_users")) {
        return { rows: [{ value: user }], rowCount: 1 };
      }
      if (trimmed.startsWith("INSERT INTO persistence_auth_sessions")) {
        throw new Error("simulated login insert failure");
      }
      throw new Error(`unexpected SQL: ${trimmed}`);
    },
  };
  const p = createPostgresPersistence({ pgClient: transactionClient });

  await assert.rejects(
    p.issueAuthSession({ userId: user.id, expectedUser: user, session }),
    /simulated login insert failure/,
  );
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("[postgres] password reset atomically updates password, consumes token, and revokes only the user", async () => {
  const p = createPostgresPersistence({ pgClient: createPgMock() });
  const expectedUser = authUser();
  const updatedUser = authUser({ passwordHash: "new-hash", updatedAt: 2_000 });
  const expectedToken = passwordResetToken();
  const consumedToken = passwordResetToken({ usedAt: 2_000 });
  const siblingToken = passwordResetToken({ tokenHash: "reset-sibling" });
  const unrelatedToken = passwordResetToken({
    tokenHash: "reset-unrelated-token",
    userId: "writer-2",
  });
  const current = authSession({ sessionId: "reset-current" });
  const unrelated = authSession({
    sessionId: "reset-unrelated",
    userId: "writer-2",
    familyId: "family-2",
  });
  await p.put({ domain: "auth_users", key: expectedUser.id, value: expectedUser });
  await p.put({
    domain: "auth_password_reset_tokens",
    key: expectedToken.tokenHash,
    value: expectedToken,
  });
  await p.put({
    domain: "auth_password_reset_tokens",
    key: siblingToken.tokenHash,
    value: siblingToken,
  });
  await p.put({
    domain: "auth_password_reset_tokens",
    key: unrelatedToken.tokenHash,
    value: unrelatedToken,
  });
  await p.put({ domain: "auth_sessions", key: current.sessionId, value: current });
  await p.put({ domain: "auth_sessions", key: unrelated.sessionId, value: unrelated });

  const completed = await p.completePasswordReset({
    expectedUser,
    updatedUser,
    expectedToken,
    consumedToken,
  });

  assert.equal(completed.status, "committed");
  assert.deepEqual(await p.get({ domain: "auth_users", key: expectedUser.id }), updatedUser);
  assert.deepEqual(await p.get({
    domain: "auth_password_reset_tokens",
    key: expectedToken.tokenHash,
  }), consumedToken);
  assert.deepEqual(await p.get({
    domain: "auth_password_reset_tokens",
    key: siblingToken.tokenHash,
  }), { ...siblingToken, usedAt: consumedToken.usedAt });
  assert.deepEqual(await p.get({
    domain: "auth_password_reset_tokens",
    key: unrelatedToken.tokenHash,
  }), unrelatedToken);
  assert.deepEqual(
    completed.invalidatedTokenHashes.sort(),
    [expectedToken.tokenHash, siblingToken.tokenHash].sort(),
  );
  assert.equal(completed.tokens.length, 2);
  assert.equal(Number((await p.get({
    domain: "auth_sessions",
    key: current.sessionId,
  })).revokedAt), consumedToken.usedAt);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: unrelated.sessionId }), unrelated);

  const replay = await p.completePasswordReset({
    expectedUser,
    updatedUser,
    expectedToken,
    consumedToken,
  });
  assert.equal(replay.status, "conflict");
  assert.deepEqual(await p.get({ domain: "auth_users", key: expectedUser.id }), updatedUser);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: unrelated.sessionId }), unrelated);
});

test("[postgres] password reset rejects mixed-user and duplicate canonical token rows", async () => {
  const expectedUser = authUser();
  const updatedUser = authUser({ passwordHash: "new-hash", updatedAt: 2_000 });
  const expectedToken = passwordResetToken();
  const consumedToken = passwordResetToken({ usedAt: 2_000 });

  for (const corruption of ["mixed-user", "duplicate"]) {
    const calls = [];
    const pgClient = {
      async query(sql) {
        const trimmed = sql.replace(/\s+/g, " ").trim();
        calls.push(trimmed);
        if (trimmed === "BEGIN" || trimmed === "ROLLBACK") {
          return { rows: [], rowCount: 0 };
        }
        if (trimmed.startsWith("SELECT pg_advisory_xact_lock")) {
          return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
        }
        if (trimmed.startsWith("SELECT key, value FROM persistence_auth_password_reset_tokens")) {
          const corruptRow = corruption === "mixed-user"
            ? {
              key: "mixed-user-token",
              value: passwordResetToken({ tokenHash: "mixed-user-token", userId: "writer-2" }),
            }
            : { key: expectedToken.tokenHash, value: expectedToken };
          return {
            rows: [
              { key: expectedToken.tokenHash, value: expectedToken },
              corruptRow,
            ],
            rowCount: 2,
          };
        }
        throw new Error(`unexpected SQL after corrupt token rows: ${trimmed}`);
      },
    };
    const p = createPostgresPersistence({ pgClient });
    await assert.rejects(
      p.completePasswordReset({ expectedUser, updatedUser, expectedToken, consumedToken }),
      corruption === "mixed-user" ? /invalid canonical token row/ : /duplicate canonical token rows/,
    );
    assert.equal(calls.at(-1), "ROLLBACK");
    assert.equal(calls.some((sql) => sql.startsWith("UPDATE persistence_auth_users")), false);
  }
});

test("[postgres] password reset rolls back token, password, and every session after a partial failure", async () => {
  const expectedUser = authUser();
  const updatedUser = authUser({ passwordHash: "new-hash", updatedAt: 2_000 });
  const expectedToken = passwordResetToken();
  const consumedToken = passwordResetToken({ usedAt: 2_000 });
  const first = authSession({ sessionId: "reset-partial-first" });
  const second = authSession({ sessionId: "reset-partial-second" });
  const users = new Map([[expectedUser.id, structuredClone(expectedUser)]]);
  const tokens = new Map([[expectedToken.tokenHash, structuredClone(expectedToken)]]);
  const sessions = new Map([
    [first.sessionId, structuredClone(first)],
    [second.sessionId, structuredClone(second)],
  ]);
  let checkpoint = null;
  let sessionUpdateCount = 0;
  const calls = [];
  const pgClient = {
    async query(sql, params = []) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      calls.push(trimmed);
      if (trimmed === "BEGIN") {
        checkpoint = {
          users: structuredClone([...users.entries()]),
          tokens: structuredClone([...tokens.entries()]),
          sessions: structuredClone([...sessions.entries()]),
        };
        return { rows: [], rowCount: 0 };
      }
      if (trimmed.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
      }
      if (trimmed.startsWith("SELECT key, value FROM persistence_auth_password_reset_tokens")) {
        return {
          rows: [...tokens.entries()].map(([key, value]) => ({ key, value: structuredClone(value) })),
          rowCount: tokens.size,
        };
      }
      if (trimmed.startsWith("UPDATE persistence_auth_password_reset_tokens")) {
        if (JSON.stringify(tokens.get(params[0])) !== JSON.stringify(JSON.parse(params[1]))) {
          return { rows: [], rowCount: 0 };
        }
        tokens.set(params[0], JSON.parse(params[2]));
        return { rows: [{ value: tokens.get(params[0]) }], rowCount: 1 };
      }
      if (trimmed.startsWith("UPDATE persistence_auth_users")) {
        if (JSON.stringify(users.get(params[0])) !== JSON.stringify(JSON.parse(params[1]))) {
          return { rows: [], rowCount: 0 };
        }
        users.set(params[0], JSON.parse(params[2]));
        return { rows: [{ key: params[0] }], rowCount: 1 };
      }
      if (trimmed.startsWith("SELECT key, value FROM persistence_auth_sessions")) {
        return {
          rows: [...sessions.entries()].map(([key, value]) => ({ key, value: structuredClone(value) })),
          rowCount: sessions.size,
        };
      }
      if (trimmed.startsWith("UPDATE persistence_auth_sessions")) {
        sessionUpdateCount += 1;
        if (sessionUpdateCount === 2) throw new Error("simulated second reset revocation failure");
        sessions.set(params[0], JSON.parse(params[2]));
        return { rows: [{ value: sessions.get(params[0]) }], rowCount: 1 };
      }
      if (trimmed === "ROLLBACK") {
        for (const [target, rows] of [
          [users, checkpoint.users],
          [tokens, checkpoint.tokens],
          [sessions, checkpoint.sessions],
        ]) {
          target.clear();
          for (const [key, value] of rows) target.set(key, value);
        }
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`unexpected SQL: ${trimmed}`);
    },
  };
  const p = createPostgresPersistence({ pgClient });

  await assert.rejects(
    p.completePasswordReset({ expectedUser, updatedUser, expectedToken, consumedToken }),
    /simulated second reset revocation failure/,
  );
  assert.deepEqual(users.get(expectedUser.id), expectedUser);
  assert.deepEqual(tokens.get(expectedToken.tokenHash), expectedToken);
  assert.deepEqual(sessions.get(first.sessionId), first);
  assert.deepEqual(sessions.get(second.sessionId), second);
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("[postgres] unknown password-reset COMMIT discards the connection and is unsafe to retry", async () => {
  const expectedUser = authUser();
  const updatedUser = authUser({ passwordHash: "new-hash", updatedAt: 2_000 });
  const expectedToken = passwordResetToken();
  const consumedToken = passwordResetToken({ usedAt: 2_000 });
  const commitError = new Error("simulated password reset commit connection loss");
  const calls = [];
  let releasedWith = null;
  const transactionClient = {
    async query(sql, params = []) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      calls.push(trimmed);
      if (trimmed === "BEGIN" || trimmed === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (trimmed.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
      }
      if (trimmed.startsWith("SELECT key, value FROM persistence_auth_password_reset_tokens")) {
        return {
          rows: [{ key: expectedToken.tokenHash, value: expectedToken }],
          rowCount: 1,
        };
      }
      if (trimmed.startsWith("UPDATE persistence_auth_password_reset_tokens")) {
        return { rows: [{ value: JSON.parse(params[2]) }], rowCount: 1 };
      }
      if (trimmed.startsWith("UPDATE persistence_auth_users")) {
        return { rows: [{ key: expectedUser.id }], rowCount: 1 };
      }
      if (trimmed.startsWith("SELECT key, value FROM persistence_auth_sessions")) {
        return { rows: [], rowCount: 0 };
      }
      if (trimmed === "COMMIT") throw commitError;
      throw new Error(`unexpected SQL: ${trimmed}`);
    },
    release(error) {
      releasedWith = error || null;
    },
  };
  const p = createPostgresPersistence({
    pgClient: {
      async connect() { return transactionClient; },
      async query() { throw new Error("pool query should not be used inside the transaction"); },
    },
  });

  await assert.rejects(
    p.completePasswordReset({ expectedUser, updatedUser, expectedToken, consumedToken }),
    (error) => error === commitError && error.commitOutcomeUnknown === true,
  );
  assert.deepEqual(calls.slice(-2), ["COMMIT", "ROLLBACK"]);
  assert.equal(releasedWith, commitError);
});

test("[postgres] reset and login issuance share the user lock in both serial orderings", async () => {
  async function scenario(order) {
    const calls = [];
    const baseClient = createPgMock();
    const p = createPostgresPersistence({
      pgClient: {
        async query(sql, params = []) {
          calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
          return baseClient.query(sql, params);
        },
      },
    });
    const expectedUser = authUser({ id: `writer-${order}` });
    const updatedUser = {
      ...expectedUser,
      password: { ...expectedUser.password, hash: `new-${order}` },
      updatedAt: 2_000,
    };
    const expectedToken = passwordResetToken({
      tokenHash: `reset-${order}`,
      userId: expectedUser.id,
    });
    const consumedToken = { ...expectedToken, usedAt: 2_000 };
    const loginSession = authSession({
      sessionId: `login-${order}`,
      userId: expectedUser.id,
      familyId: `family-${order}`,
    });
    await p.put({ domain: "auth_users", key: expectedUser.id, value: expectedUser });
    await p.put({
      domain: "auth_password_reset_tokens",
      key: expectedToken.tokenHash,
      value: expectedToken,
    });
    let issuance;
    if (order === "login-first") {
      issuance = await p.issueAuthSession({
        userId: expectedUser.id,
        expectedUser,
        session: loginSession,
      });
      await p.completePasswordReset({ expectedUser, updatedUser, expectedToken, consumedToken });
    } else {
      await p.completePasswordReset({ expectedUser, updatedUser, expectedToken, consumedToken });
      issuance = await p.issueAuthSession({
        userId: expectedUser.id,
        expectedUser,
        session: loginSession,
      });
    }
    return { p, calls, issuance, loginSession, expectedUser };
  }

  const loginFirst = await scenario("login-first");
  assert.equal(loginFirst.issuance.status, "committed");
  assert.equal(Number((await loginFirst.p.get({
    domain: "auth_sessions",
    key: loginFirst.loginSession.sessionId,
  }))?.revokedAt || 0) > 0, true);
  const resetFirst = await scenario("reset-first");
  assert.equal(resetFirst.issuance.status, "user_missing");
  assert.equal(await resetFirst.p.get({
    domain: "auth_sessions",
    key: resetFirst.loginSession.sessionId,
  }), null);
  for (const result of [loginFirst, resetFirst]) {
    const locks = result.calls.filter((call) => call.sql.startsWith("SELECT pg_advisory_xact_lock"));
    assert.equal(locks.length, 2);
    assert.deepEqual(locks.map((call) => call.params), [[result.expectedUser.id], [result.expectedUser.id]]);
  }
});

test("[postgres] concurrent auth rotation has one winner and leaves unrelated users untouched", async () => {
  const p = createPostgresPersistence({ pgClient: createPgMock() });
  const current = authSession({ sessionId: "session-current" });
  const unrelated = authSession({
    sessionId: "session-unrelated",
    userId: "writer-2",
    familyId: "family-2",
  });
  const nextA = authSession({ sessionId: "session-next-a" });
  const nextB = authSession({ sessionId: "session-next-b" });
  const previousA = {
    ...current,
    updatedAt: 2_000,
    revokedAt: 2_000,
    replacedBySessionId: nextA.sessionId,
  };
  const previousB = {
    ...current,
    updatedAt: 2_001,
    revokedAt: 2_001,
    replacedBySessionId: nextB.sessionId,
  };
  await p.put({ domain: "auth_sessions", key: current.sessionId, value: current });
  await p.put({ domain: "auth_sessions", key: unrelated.sessionId, value: unrelated });

  const results = await Promise.all([
    p.rotateAuthSession({ expectedSession: current, previousSession: previousA, nextSession: nextA }),
    p.rotateAuthSession({ expectedSession: current, previousSession: previousB, nextSession: nextB }),
  ]);

  assert.equal(results.filter(Boolean).length, 1);
  const persistedPrevious = await p.get({ domain: "auth_sessions", key: current.sessionId });
  const winner = persistedPrevious.replacedBySessionId === nextA.sessionId ? nextA : nextB;
  const loser = winner.sessionId === nextA.sessionId ? nextB : nextA;
  assert.equal(persistedPrevious.revokedAt > 0, true);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: winner.sessionId }), winner);
  assert.equal(await p.get({ domain: "auth_sessions", key: loser.sessionId }), null);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: unrelated.sessionId }), unrelated);
});

test("[postgres] auth rotation rejects cross-user replacements before opening a transaction", async () => {
  const calls = [];
  const p = createPostgresPersistence({
    pgClient: {
      async query(sql) {
        calls.push(sql);
        return { rows: [], rowCount: 0 };
      },
    },
  });
  const current = authSession({ sessionId: "session-current" });
  const next = authSession({
    sessionId: "session-next",
    userId: "writer-2",
  });
  await assert.rejects(
    p.rotateAuthSession({
      expectedSession: current,
      previousSession: {
        ...current,
        revokedAt: 2_000,
        replacedBySessionId: next.sessionId,
      },
      nextSession: next,
    }),
    /cannot cross users/,
  );
  assert.equal(calls.length, 0);
});

test("[postgres] auth rotation rolls back when replacement insertion fails", async () => {
  const current = authSession({ sessionId: "session-current" });
  const next = authSession({ sessionId: "session-next" });
  const rows = new Map([[current.sessionId, structuredClone(current)]]);
  const transactionCalls = [];
  let checkpoint = null;
  const pgClient = {
    async query(sql, params = []) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      transactionCalls.push(trimmed);
      if (trimmed === "BEGIN") {
        checkpoint = structuredClone([...rows.entries()]);
        return { rows: [], rowCount: 0 };
      }
      if (trimmed.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
      }
      if (trimmed.startsWith("UPDATE persistence_auth_sessions")) {
        const existing = rows.get(params[0]);
        if (JSON.stringify(existing) !== JSON.stringify(JSON.parse(params[1]))) {
          return { rows: [], rowCount: 0 };
        }
        rows.set(params[0], JSON.parse(params[2]));
        return { rows: [{ key: params[0] }], rowCount: 1 };
      }
      if (trimmed.startsWith("INSERT INTO persistence_auth_sessions")) {
        throw new Error("simulated replacement insert failure");
      }
      if (trimmed === "ROLLBACK") {
        rows.clear();
        for (const [key, value] of checkpoint || []) rows.set(key, value);
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`unexpected SQL: ${trimmed}`);
    },
  };
  const p = createPostgresPersistence({ pgClient });
  await assert.rejects(
    p.rotateAuthSession({
      expectedSession: current,
      previousSession: {
        ...current,
        revokedAt: 2_000,
        replacedBySessionId: next.sessionId,
      },
      nextSession: next,
    }),
    /simulated replacement insert failure/,
  );
  assert.deepEqual(rows.get(current.sessionId), current);
  assert.equal(rows.has(next.sessionId), false);
  assert.equal(transactionCalls.at(-1), "ROLLBACK");
});

test("[postgres] single-session revocation is idempotent and leaves unrelated users untouched", async () => {
  const p = createPostgresPersistence({ pgClient: createPgMock() });
  const current = authSession({ sessionId: "session-revoke" });
  const unrelated = authSession({
    sessionId: "session-revoke-unrelated",
    userId: "writer-2",
    familyId: "family-2",
  });
  const revoked = {
    ...current,
    updatedAt: 2_000,
    revokedAt: 2_000,
  };
  await p.put({ domain: "auth_sessions", key: current.sessionId, value: current });
  await p.put({ domain: "auth_sessions", key: unrelated.sessionId, value: unrelated });

  const first = await p.revokeAuthSessions({
    userId: current.userId,
    expectedSessions: [current],
    revokedSessions: [revoked],
  });
  assert.equal(first.status, "committed");
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: current.sessionId }), revoked);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: unrelated.sessionId }), unrelated);

  const repeated = await p.revokeAuthSessions({
    userId: current.userId,
    expectedSessions: [revoked],
    revokedSessions: [revoked],
  });
  assert.equal(repeated.status, "committed");
  assert.deepEqual(repeated.sessions, [revoked]);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: unrelated.sessionId }), unrelated);
});

test("[postgres] session revocation rejects mixed users and duplicate rows before I/O", async () => {
  const calls = [];
  const p = createPostgresPersistence({
    pgClient: {
      async query(sql) {
        calls.push(sql);
        return { rows: [], rowCount: 0 };
      },
    },
  });
  const first = authSession({ sessionId: "session-first" });
  const second = authSession({
    sessionId: "session-second",
    userId: "writer-2",
    familyId: "family-2",
  });
  const revokedFirst = { ...first, revokedAt: 2_000, updatedAt: 2_000 };
  const revokedSecond = { ...second, revokedAt: 2_000, updatedAt: 2_000 };

  await assert.rejects(
    p.revokeAuthSessions({
      userId: first.userId,
      expectedSessions: [first, second],
      revokedSessions: [revokedFirst, revokedSecond],
    }),
    /cannot cross users/,
  );
  await assert.rejects(
    p.revokeAuthSessions({
      userId: first.userId,
      expectedSessions: [first, first],
      revokedSessions: [revokedFirst, revokedFirst],
    }),
    /unique matching session rows/,
  );
  assert.equal(calls.length, 0);
});

test("[postgres] stale active revocation returns the canonical rotated predecessor", async () => {
  const p = createPostgresPersistence({ pgClient: createPgMock() });
  const active = authSession({ sessionId: "session-stale-active" });
  const replacement = authSession({ sessionId: "session-stale-replacement" });
  const canonicalPredecessor = {
    ...active,
    revokedAt: 2_000,
    updatedAt: 2_000,
    replacedBySessionId: replacement.sessionId,
  };
  const requestedRevocation = { ...active, revokedAt: 3_000, updatedAt: 3_000 };
  await p.put({
    domain: "auth_sessions",
    key: canonicalPredecessor.sessionId,
    value: canonicalPredecessor,
  });
  await p.put({ domain: "auth_sessions", key: replacement.sessionId, value: replacement });

  const stale = await p.revokeAuthSessions({
    userId: active.userId,
    expectedSessions: [active],
    revokedSessions: [requestedRevocation],
  });
  assert.equal(stale.status, "conflict");
  assert.deepEqual(stale.sessions, [canonicalPredecessor]);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: replacement.sessionId }), replacement);

  const alreadyKnown = await p.revokeAuthSessions({
    userId: active.userId,
    expectedSessions: [canonicalPredecessor],
    revokedSessions: [canonicalPredecessor],
  });
  assert.equal(alreadyKnown.status, "committed");
  assert.deepEqual(alreadyKnown.sessions, [canonicalPredecessor]);
});

test("[postgres] unknown revocation COMMIT outcome is marked unsafe to retry and discards the connection", async () => {
  const active = authSession({ sessionId: "session-unknown-commit" });
  const revoked = { ...active, revokedAt: 2_000, updatedAt: 2_000 };
  const commitError = new Error("simulated commit connection loss");
  const calls = [];
  let releasedWith = null;
  const transactionClient = {
    async query(sql) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      calls.push(trimmed);
      if (trimmed === "BEGIN" || trimmed === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (trimmed.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
      }
      if (trimmed.startsWith("UPDATE persistence_auth_sessions")) {
        return { rows: [{ value: revoked }], rowCount: 1 };
      }
      if (trimmed === "COMMIT") throw commitError;
      throw new Error(`unexpected SQL: ${trimmed}`);
    },
    release(error) {
      releasedWith = error || null;
    },
  };
  const p = createPostgresPersistence({
    pgClient: {
      async connect() { return transactionClient; },
      async query() { throw new Error("pool query should not be used inside the transaction"); },
    },
  });

  await assert.rejects(
    p.revokeAuthSessions({
      userId: active.userId,
      expectedSessions: [active],
      revokedSessions: [revoked],
    }),
    (error) => error === commitError && error.commitOutcomeUnknown === true,
  );
  assert.deepEqual(calls.slice(-2), ["COMMIT", "ROLLBACK"]);
  assert.equal(releasedWith, commitError);
});

test("[postgres] user-wide revocation preserves its exception and unrelated users", async () => {
  const p = createPostgresPersistence({ pgClient: createPgMock() });
  const oldSession = authSession({ sessionId: "session-old" });
  const currentSession = authSession({ sessionId: "session-current" });
  const unrelated = authSession({
    sessionId: "session-other-user",
    userId: "writer-2",
    familyId: "family-2",
  });
  for (const session of [oldSession, currentSession, unrelated]) {
    await p.put({ domain: "auth_sessions", key: session.sessionId, value: session });
  }

  const result = await p.revokeAuthSessionsForUser({
    userId: oldSession.userId,
    exceptSessionId: currentSession.sessionId,
    revokedAt: 3_000,
  });

  assert.equal(result.status, "committed");
  assert.deepEqual(result.sessions.map((session) => session.sessionId), [oldSession.sessionId]);
  assert.deepEqual(result.revokedSessionIds, [oldSession.sessionId]);
  assert.deepEqual(result.preservedSession, currentSession);
  assert.equal(Number((await p.get({
    domain: "auth_sessions",
    key: oldSession.sessionId,
  })).revokedAt), 3_000);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: currentSession.sessionId }), currentSession);
  assert.deepEqual(await p.get({ domain: "auth_sessions", key: unrelated.sessionId }), unrelated);
});

test("[postgres] refresh and revoke share one user lock and preserve both serial orderings", async () => {
  async function scenario(order) {
    const calls = [];
    const baseClient = createPgMock();
    const p = createPostgresPersistence({
      pgClient: {
        async query(sql, params = []) {
          calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
          return baseClient.query(sql, params);
        },
      },
    });
    const current = authSession({ sessionId: `session-${order}-current` });
    const replacement = authSession({ sessionId: `session-${order}-replacement` });
    const previous = {
      ...current,
      updatedAt: 2_000,
      revokedAt: 2_000,
      replacedBySessionId: replacement.sessionId,
    };
    await p.put({ domain: "auth_sessions", key: current.sessionId, value: current });
    let rotated;
    if (order === "refresh-first") {
      rotated = await p.rotateAuthSession({
        expectedSession: current,
        previousSession: previous,
        nextSession: replacement,
      });
      await p.revokeAuthSessionsForUser({ userId: current.userId, revokedAt: 3_000 });
    } else {
      await p.revokeAuthSessionsForUser({ userId: current.userId, revokedAt: 3_000 });
      rotated = await p.rotateAuthSession({
        expectedSession: current,
        previousSession: previous,
        nextSession: replacement,
      });
    }
    return { p, calls, current, replacement, rotated };
  }

  const refreshFirst = await scenario("refresh-first");
  assert.equal(refreshFirst.rotated, true);
  assert.equal(Number((await refreshFirst.p.get({
    domain: "auth_sessions",
    key: refreshFirst.replacement.sessionId,
  }))?.revokedAt || 0) > 0, true);
  const revokeFirst = await scenario("revoke-first");
  assert.equal(revokeFirst.rotated, false);
  assert.equal(await revokeFirst.p.get({
    domain: "auth_sessions",
    key: revokeFirst.replacement.sessionId,
  }), null);
  for (const result of [refreshFirst, revokeFirst]) {
    const locks = result.calls.filter((call) => call.sql.startsWith("SELECT pg_advisory_xact_lock"));
    assert.equal(locks.length, 2);
    assert.deepEqual(locks.map((call) => call.params), [[result.current.userId], [result.current.userId]]);
  }
});

test("[postgres] user-wide revocation rolls back every row after an adapter failure", async () => {
  const first = authSession({ sessionId: "session-first" });
  const second = authSession({ sessionId: "session-second" });
  const rows = new Map([
    [first.sessionId, structuredClone(first)],
    [second.sessionId, structuredClone(second)],
  ]);
  let checkpoint = null;
  let updateCount = 0;
  const transactionCalls = [];
  const pgClient = {
    async query(sql, params = []) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      transactionCalls.push(trimmed);
      if (trimmed === "BEGIN") {
        checkpoint = structuredClone([...rows.entries()]);
        return { rows: [], rowCount: 0 };
      }
      if (trimmed.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [{ pg_advisory_xact_lock: "" }], rowCount: 1 };
      }
      if (trimmed.startsWith("SELECT key, value FROM persistence_auth_sessions")) {
        return {
          rows: [...rows.entries()].map(([key, value]) => ({ key, value: structuredClone(value) })),
          rowCount: rows.size,
        };
      }
      if (trimmed.startsWith("UPDATE persistence_auth_sessions")) {
        updateCount += 1;
        if (updateCount === 2) throw new Error("simulated second-row update failure");
        const current = rows.get(params[0]);
        assert.deepEqual(current, JSON.parse(params[1]));
        const updated = JSON.parse(params[2]);
        rows.set(params[0], updated);
        return { rows: [{ value: updated }], rowCount: 1 };
      }
      if (trimmed === "ROLLBACK") {
        rows.clear();
        for (const [key, value] of checkpoint || []) rows.set(key, value);
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`unexpected SQL: ${trimmed}`);
    },
  };
  const p = createPostgresPersistence({ pgClient });

  await assert.rejects(
    p.revokeAuthSessionsForUser({ userId: first.userId, revokedAt: 4_000 }),
    /simulated second-row update failure/,
  );
  assert.deepEqual(rows.get(first.sessionId), first);
  assert.deepEqual(rows.get(second.sessionId), second);
  assert.equal(transactionCalls.at(-1), "ROLLBACK");
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

  test(`[${impl.name}] list treats LIKE metacharacters in prefixes literally`, async () => {
    const p = impl.create();
    const prefix = "project%_\\folder";
    try {
      await p.put({ domain: "screenplay", key: `${prefix}:alpha`, value: { exact: 1 } });
      await p.put({ domain: "screenplay", key: `${prefix}:beta`, value: { exact: 2 } });
      await p.put({
        domain: "screenplay",
        key: "project-anyXfolder:wrong",
        value: { wildcardMatchOnly: true },
      });

      const exact = await p.list({ domain: "screenplay", prefix });
      assert.deepEqual(
        exact.map((record) => record.key),
        [`${prefix}:alpha`, `${prefix}:beta`],
      );
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
