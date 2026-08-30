import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  ALL_MIGRATIONS,
  POST_IMPORT_MIGRATIONS,
  PRE_IMPORT_MIGRATIONS,
  importAuthRecordsAtomically,
  runCli,
  runMigration,
  validateAuthSnapshot,
} from "../../scripts/migrate_stores_to_postgres.mjs";

const TEST_PASSWORD_SALT = "a".repeat(32);
const TEST_PASSWORD_HASH = "b".repeat(64);
const ALTERNATE_PASSWORD_SALT = "c".repeat(32);

function makeLogger() {
  const logs = [];
  const errors = [];
  return {
    logs,
    errors,
    log: (...args) => logs.push(args.join(" ")),
    error: (...args) => errors.push(args.join(" ")),
  };
}

function makeBackend(t, files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-pg-import-"));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(
      path.join(directory, name),
      typeof value === "string" ? value : JSON.stringify(value),
      "utf8",
    );
  }
  return directory;
}

function sampleUserStore() {
  return {
    users: [{
      id: "user_1",
      email: "writer@example.com",
      password: {
        salt: TEST_PASSWORD_SALT,
        hash: TEST_PASSWORD_HASH,
        iterations: 120_000,
      },
    }],
    authSessions: [{
      sessionId: "session_1",
      familyId: "family_1",
      userId: "user_1",
      tokenHash: "session_token_1",
      expiresAt: 1_900_000_000_000,
      revokedAt: 0,
    }],
    passwordResetTokens: [{
      tokenHash: "reset_1",
      userId: "user_1",
      expiresAt: 1_900_000_000_000,
      usedAt: 0,
    }],
    emailVerificationTokens: [{
      tokenHash: "verify_1",
      userId: "user_1",
      expiresAt: 1_900_000_000_000,
      usedAt: 0,
    }],
  };
}

function emptyUserStore() {
  return {
    users: [],
    authSessions: [],
    passwordResetTokens: [],
    emailVerificationTokens: [],
  };
}

const AUTH_TABLE_NAMES = [
  "persistence_auth_users",
  "persistence_auth_sessions",
  "persistence_auth_password_reset_tokens",
  "persistence_auth_email_verification_tokens",
];

function createStatefulAuthPool(
  initialTables,
  { failMarker = false, initialMarker = null } = {},
) {
  let committed = structuredClone(initialTables);
  let committedMarker = structuredClone(initialMarker);
  let working = null;
  let workingMarker = null;
  const committedSnapshotsBeforeCommit = [];
  const events = [];

  const client = {
    async query(sql, params = []) {
      events.push(sql);
      if (sql === "BEGIN") {
        working = structuredClone(committed);
        workingMarker = structuredClone(committedMarker);
        return { rowCount: 0, rows: [] };
      }
      if (sql === "ROLLBACK") {
        working = null;
        workingMarker = null;
        return { rowCount: 0, rows: [] };
      }
      if (sql === "COMMIT") {
        committed = structuredClone(working);
        committedMarker = structuredClone(workingMarker);
        working = null;
        workingMarker = null;
        return { rowCount: 0, rows: [] };
      }

      committedSnapshotsBeforeCommit.push(structuredClone(committed));
      const deleteMatch = sql.match(/^DELETE FROM (persistence_auth_[a-z_]+)$/);
      if (deleteMatch) {
        working[deleteMatch[1]] = {};
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("CREATE TABLE IF NOT EXISTS persistence_auth_store_meta")) {
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("FROM persistence_auth_store_meta")) {
        return {
          rowCount: workingMarker == null ? 0 : 1,
          rows: workingMarker == null ? [] : [{ value: structuredClone(workingMarker) }],
        };
      }
      if (sql.includes("INSERT INTO persistence_auth_store_meta")) {
        if (failMarker) throw new Error("simulated marker failure");
        workingMarker = JSON.parse(params[1]);
        return { rowCount: 1, rows: [] };
      }
      const insertMatch = sql.match(/INSERT INTO (persistence_auth_[a-z_]+)/);
      if (insertMatch) {
        working[insertMatch[1]][params[0]] = JSON.parse(params[1]);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected SQL in stateful auth pool: ${sql}`);
    },
    release() {},
  };

  return {
    pool: { connect: async () => client, end: async () => {} },
    events,
    committedSnapshotsBeforeCommit,
    getCommitted: () => structuredClone(committed),
    getCommittedMarker: () => structuredClone(committedMarker),
  };
}

async function assertRejectedBeforeDatabaseCalls(t, files, pattern) {
  const backendDirectory = makeBackend(t, files);
  const calls = [];
  await assert.rejects(
    runMigration({
      databaseUrl: "postgres://example.invalid/them",
      backendDirectory,
      applySchemaFn: async () => calls.push("schema"),
      createPersistenceFn: () => {
        calls.push("persistence");
        throw new Error("validation must precede persistence creation");
      },
      importAuthRecordsFn: async () => calls.push("auth-import"),
      logger: makeLogger(),
    }),
    pattern,
  );
  assert.deepEqual(calls, []);
}

test("[postgres-import] dry-run reads legacy files without any schema or database operation", async (t) => {
  const backendDirectory = makeBackend(t, {
    "outbox_store.json": { outbox_1: { id: "outbox_1" } },
    "user_store.json": sampleUserStore(),
  });
  const logger = makeLogger();

  const result = await runMigration({
    databaseUrl: "",
    backendDirectory,
    dryRun: true,
    logger,
    applySchemaFn: async () => {
      throw new Error("dry-run must not apply schema");
    },
    createPersistenceFn: () => {
      throw new Error("dry-run must not create persistence");
    },
    importAuthRecordsFn: async () => {
      throw new Error("dry-run must not connect for auth import");
    },
  });

  assert.deepEqual(result, { totalMigrated: 5, dryRun: true, schemaOnly: false });
  assert.match(logger.logs.at(-1), /would migrate 5 record\(s\)/);
});

test("[postgres-import] schema-only applies every required table migration without importing auth", async () => {
  let applied = null;
  const result = await runMigration({
    databaseUrl: "postgres://example.invalid/them",
    schemaOnly: true,
    applySchemaFn: async ({ migrationNames }) => {
      applied = [...migrationNames];
    },
    createPersistenceFn: () => {
      throw new Error("schema-only must not create persistence");
    },
    importAuthRecordsFn: async () => {
      throw new Error("schema-only must not import auth records");
    },
  });

  assert.deepEqual(applied, [...ALL_MIGRATIONS]);
  assert.deepEqual(applied, [...PRE_IMPORT_MIGRATIONS, ...POST_IMPORT_MIGRATIONS]);
  assert.deepEqual(result, { totalMigrated: 0, dryRun: false, schemaOnly: true });
});

test("[postgres-import] schema-only and empty replacement authorization are mutually exclusive", async () => {
  const calls = [];
  await assert.rejects(
    runMigration({
      databaseUrl: "postgres://example.invalid/them",
      schemaOnly: true,
      allowEmptyAuth: true,
      applySchemaFn: async () => calls.push("schema"),
      createPersistenceFn: () => calls.push("persistence"),
      importAuthRecordsFn: async () => calls.push("auth-import"),
    }),
    (error) => {
      assert.equal(error?.exitCode, 2);
      assert.match(error?.message || "", /mutually exclusive/);
      return true;
    },
  );
  assert.deepEqual(calls, []);
});

test("[postgres-import] empty replacement dry-run warns without touching a database", async (t) => {
  const backendDirectory = makeBackend(t, { "user_store.json": emptyUserStore() });
  const logger = makeLogger();
  const result = await runMigration({
    databaseUrl: "",
    backendDirectory,
    dryRun: true,
    allowEmptyAuth: true,
    logger,
    applySchemaFn: async () => {
      throw new Error("dry-run must not apply schema");
    },
    createPersistenceFn: () => {
      throw new Error("dry-run must not create persistence");
    },
    importAuthRecordsFn: async () => {
      throw new Error("dry-run must not import auth records");
    },
  });

  assert.deepEqual(result, { totalMigrated: 0, dryRun: true, schemaOnly: false });
  assert.match(logger.logs.join("\n"), /WARNING: --allow-empty-auth.*clear all canonical auth/s);
  assert.match(logger.logs.at(-1), /would migrate 0 record\(s\)/);
});

test("[postgres-import] auth rows and canonical marker commit in one transaction", async () => {
  const events = [];
  const client = {
    async query(sql, params) {
      events.push({ type: "query", sql, params });
      return { rowCount: 1, rows: [] };
    },
    release() {
      events.push({ type: "release" });
    },
  };
  const pool = {
    async connect() {
      events.push({ type: "connect" });
      return client;
    },
    async end() {
      events.push({ type: "end" });
    },
  };

  await importAuthRecordsAtomically({
    databaseUrl: "postgres://example.invalid/them",
    records: [
      { domain: "auth_users", key: "user_1", value: { id: "user_1" } },
      { domain: "auth_sessions", key: "session_1", value: { sessionId: "session_1" } },
    ],
    poolFactory: async () => pool,
    logger: makeLogger(),
  });

  const queries = events.filter(({ type }) => type === "query").map(({ sql }) => sql);
  assert.equal(queries[0], "BEGIN");
  assert.match(queries[1], /CREATE TABLE IF NOT EXISTS persistence_auth_store_meta/);
  assert.match(queries[1], /WHERE EXISTS/);
  assert.match(queries[1], /ON CONFLICT \(key\) DO NOTHING/);
  assert.match(queries[2], /FROM persistence_auth_store_meta/);
  assert.deepEqual(queries.slice(3, 7), [
    "DELETE FROM persistence_auth_users",
    "DELETE FROM persistence_auth_sessions",
    "DELETE FROM persistence_auth_password_reset_tokens",
    "DELETE FROM persistence_auth_email_verification_tokens",
  ]);
  assert.match(queries[7], /INSERT INTO persistence_auth_users/);
  assert.match(queries[8], /INSERT INTO persistence_auth_sessions/);
  assert.match(queries[9], /INSERT INTO persistence_auth_store_meta/);
  assert.doesNotMatch(queries[1], /(^|\n)\s*BEGIN;/i);
  assert.doesNotMatch(queries[1], /(^|\n)\s*COMMIT;/i);
  assert.equal(queries[10], "COMMIT");
  assert.deepEqual(events.slice(-2), [{ type: "release" }, { type: "end" }]);
});

test("[postgres-import] auth put failure rolls back before marker publication", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith("INSERT INTO persistence_auth_sessions")) {
        throw new Error("simulated auth write failure");
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, end: async () => {} };

  await assert.rejects(
    importAuthRecordsAtomically({
      databaseUrl: "postgres://example.invalid/them",
      records: [
        { domain: "auth_users", key: "user_1", value: { id: "user_1" } },
        { domain: "auth_sessions", key: "session_1", value: { sessionId: "session_1" } },
      ],
      poolFactory: async () => pool,
      logger: makeLogger(),
    }),
    /put auth_sessions:session_1 failed: simulated auth write failure/,
  );

  assert.equal(queries[0], "BEGIN");
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(
    queries.some((sql) => sql.trimStart().startsWith("INSERT INTO persistence_auth_store_meta")),
    false,
  );
  assert.equal(queries.includes("COMMIT"), false);
});

test("[postgres-import] marker failure rolls back every auth upsert", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.trimStart().startsWith("INSERT INTO persistence_auth_store_meta")) {
        throw new Error("simulated marker failure");
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, end: async () => {} };

  await assert.rejects(
    importAuthRecordsAtomically({
      databaseUrl: "postgres://example.invalid/them",
      records: [{ domain: "auth_users", key: "user_1", value: { id: "user_1" } }],
      poolFactory: async () => pool,
      logger: makeLogger(),
    }),
    /simulated marker failure/,
  );

  assert.equal(queries[0], "BEGIN");
  assert.equal(queries.some((sql) => sql.startsWith("INSERT INTO persistence_auth_users")), true);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(queries.includes("COMMIT"), false);
});

test("[postgres-import] incompatible future auth marker aborts before replacement", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes("FROM persistence_auth_store_meta")) {
        return {
          rowCount: 1,
          rows: [{ value: { schemaVersion: 2, initialized: true } }],
        };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, end: async () => {} };

  await assert.rejects(
    importAuthRecordsAtomically({
      databaseUrl: "postgres://example.invalid/them",
      records: [{ domain: "auth_users", key: "user_1", value: { id: "user_1" } }],
      poolFactory: async () => pool,
      logger: makeLogger(),
    }),
    /canonical auth marker is incompatible/,
  );

  assert.equal(queries[0], "BEGIN");
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(queries.some((sql) => sql.startsWith("DELETE FROM persistence_auth_")), false);
  assert.equal(queries.some((sql) => sql.startsWith("INSERT INTO persistence_auth_users")), false);
  assert.equal(queries.includes("COMMIT"), false);
});

test("[postgres-import] exact auth snapshot replacement hides deletions until commit", async () => {
  const initialTables = {
    persistence_auth_users: { stale_user: { id: "stale_user" } },
    persistence_auth_sessions: { stale_session: { sessionId: "stale_session" } },
    persistence_auth_password_reset_tokens: { stale_reset: { tokenHash: "stale_reset" } },
    persistence_auth_email_verification_tokens: { stale_verify: { tokenHash: "stale_verify" } },
  };
  const stateful = createStatefulAuthPool(initialTables);

  await importAuthRecordsAtomically({
    databaseUrl: "postgres://example.invalid/them",
    records: [{ domain: "auth_users", key: "user_new", value: { id: "user_new" } }],
    poolFactory: async () => stateful.pool,
    logger: makeLogger(),
  });

  assert.equal(stateful.committedSnapshotsBeforeCommit.length > 0, true);
  for (const visible of stateful.committedSnapshotsBeforeCommit) {
    assert.deepEqual(visible, initialTables, "uncommitted clears must not alter visible state");
  }
  assert.deepEqual(stateful.getCommitted(), {
    persistence_auth_users: { user_new: { id: "user_new" } },
    persistence_auth_sessions: {},
    persistence_auth_password_reset_tokens: {},
    persistence_auth_email_verification_tokens: {},
  });
  assert.deepEqual(stateful.getCommittedMarker(), { schemaVersion: 1, initialized: true });
  assert.equal(stateful.events.at(-1), "COMMIT");
});

test("[postgres-import] explicit empty auth snapshot clears every stale auth row atomically", async (t) => {
  const backendDirectory = makeBackend(t, { "user_store.json": emptyUserStore() });
  const initialTables = {
    persistence_auth_users: { stale_user: { id: "stale_user" } },
    persistence_auth_sessions: { stale_session: { sessionId: "stale_session" } },
    persistence_auth_password_reset_tokens: { stale_reset: { tokenHash: "stale_reset" } },
    persistence_auth_email_verification_tokens: { stale_verify: { tokenHash: "stale_verify" } },
  };
  const stateful = createStatefulAuthPool(initialTables);
  const applied = [];
  const logger = makeLogger();

  const result = await runMigration({
    databaseUrl: "postgres://example.invalid/them",
    backendDirectory,
    allowEmptyAuth: true,
    logger,
    applySchemaFn: async ({ migrationNames }) => applied.push(...migrationNames),
    createPersistenceFn: () => ({
      kind: "postgres",
      async close() {},
      async put() {
        throw new Error("empty source must not contain non-auth writes");
      },
    }),
    importAuthRecordsFn: (options) => importAuthRecordsAtomically({
      ...options,
      poolFactory: async () => stateful.pool,
    }),
  });

  assert.deepEqual(applied, [...PRE_IMPORT_MIGRATIONS]);
  assert.deepEqual(result, { totalMigrated: 0, dryRun: false, schemaOnly: false });
  assert.equal(stateful.committedSnapshotsBeforeCommit.length > 0, true);
  for (const visible of stateful.committedSnapshotsBeforeCommit) {
    assert.deepEqual(visible, initialTables, "empty replacement must remain hidden until commit");
  }
  assert.deepEqual(stateful.getCommitted(), {
    persistence_auth_users: {},
    persistence_auth_sessions: {},
    persistence_auth_password_reset_tokens: {},
    persistence_auth_email_verification_tokens: {},
  });
  assert.equal(stateful.events.at(-1), "COMMIT");
  assert.match(logger.logs.join("\n"), /WARNING: --allow-empty-auth/);
});

test("[postgres-import] exact auth snapshot replacement restores every stale row on rollback", async () => {
  const initialTables = {
    persistence_auth_users: { stale_user: { id: "stale_user" } },
    persistence_auth_sessions: { stale_session: { sessionId: "stale_session" } },
    persistence_auth_password_reset_tokens: { stale_reset: { tokenHash: "stale_reset" } },
    persistence_auth_email_verification_tokens: { stale_verify: { tokenHash: "stale_verify" } },
  };
  const stateful = createStatefulAuthPool(initialTables, { failMarker: true });

  await assert.rejects(
    importAuthRecordsAtomically({
      databaseUrl: "postgres://example.invalid/them",
      records: [{ domain: "auth_users", key: "user_new", value: { id: "user_new" } }],
      poolFactory: async () => stateful.pool,
      logger: makeLogger(),
    }),
    /simulated marker failure/,
  );

  assert.deepEqual(stateful.getCommitted(), initialTables);
  assert.equal(stateful.events.at(-1), "ROLLBACK");
});

test("[postgres-import] auth put failure reaches the CLI as a non-zero status", async (t) => {
  const backendDirectory = makeBackend(t, { "user_store.json": sampleUserStore() });
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith("INSERT INTO persistence_auth_sessions")) {
        throw new Error("simulated auth write failure");
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, end: async () => {} };
  const logger = makeLogger();

  const exitCode = await runCli({
    logger,
    runMigrationFn: () => runMigration({
      databaseUrl: "postgres://example.invalid/them",
      backendDirectory,
      logger,
      applySchemaFn: async () => {},
      createPersistenceFn: () => ({
        kind: "postgres",
        async put() {},
        async close() {},
      }),
      importAuthRecordsFn: (options) => importAuthRecordsAtomically({
        ...options,
        poolFactory: async () => pool,
      }),
    }),
  });

  assert.equal(exitCode, 1);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(
    queries.some((sql) => sql.trimStart().startsWith("INSERT INTO persistence_auth_store_meta")),
    false,
  );
  assert.match(logger.errors.join("\n"), /put auth_sessions:session_1 failed/);
});

test("[postgres-import] any non-auth put failure returns a non-zero CLI status and skips auth publication", async (t) => {
  const backendDirectory = makeBackend(t, {
    "outbox_store.json": { outbox_1: { id: "outbox_1" } },
    "user_store.json": sampleUserStore(),
  });
  let authImportCalled = false;
  let persistenceClosed = false;
  const logger = makeLogger();

  const exitCode = await runCli({
    logger,
    runMigrationFn: () => runMigration({
      databaseUrl: "postgres://example.invalid/them",
      backendDirectory,
      logger,
      applySchemaFn: async ({ migrationNames }) => {
        assert.deepEqual([...migrationNames], [...PRE_IMPORT_MIGRATIONS]);
      },
      createPersistenceFn: () => ({
        kind: "postgres",
        async put() {
          throw new Error("simulated non-auth write failure");
        },
        async close() {
          persistenceClosed = true;
        },
      }),
      importAuthRecordsFn: async () => {
        authImportCalled = true;
      },
    }),
  });

  assert.equal(exitCode, 1);
  assert.equal(persistenceClosed, true);
  assert.equal(authImportCalled, false);
  assert.match(logger.errors.join("\n"), /put outbox:outbox_1 failed/);
});

test("[postgres-import] malformed auth source aborts before the first schema write", async (t) => {
  const backendDirectory = makeBackend(t, { "user_store.json": "{" });
  let schemaCalled = false;

  await assert.rejects(
    runMigration({
      databaseUrl: "postgres://example.invalid/them",
      backendDirectory,
      applySchemaFn: async () => {
        schemaCalled = true;
      },
      createPersistenceFn: () => {
        throw new Error("must not create persistence for malformed source");
      },
      importAuthRecordsFn: async () => {
        throw new Error("must not publish auth marker for malformed source");
      },
      logger: makeLogger(),
    }),
    /cannot parse .*user_store\.json/,
  );

  assert.equal(schemaCalled, false);
});

test("[postgres-import] absent and unrecognized auth snapshots fail before database calls", async (t) => {
  await t.test("absent user_store.json", async (t) => {
    await assertRejectedBeforeDatabaseCalls(t, {}, /required auth snapshot is missing/);
  });
  await t.test("empty object", async (t) => {
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": {} },
      /must contain a "users" array/,
    );
  });
  await t.test("partial arrays", async (t) => {
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": { users: [] } },
      /must contain a "authSessions" or legacy "auth_sessions" array/,
    );
  });
  await t.test("conflicting duplicate array aliases", async (t) => {
    const payload = sampleUserStore();
    payload.auth_sessions = [];
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /conflicting array aliases "authSessions" and "auth_sessions"/,
    );
  });
  await t.test("recognized but empty snapshot", async (t) => {
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": emptyUserStore() },
      /contains no users; use --allow-empty-auth/,
    );
  });
});

test("[postgres-import] invalid auth records and user references fail before database calls", async (t) => {
  await t.test("user without id", async (t) => {
    const payload = sampleUserStore();
    payload.users[0] = { email: "writer@example.com" };
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /users\[0\].*nonempty string "id"/,
    );
  });
  await t.test("user without email", async (t) => {
    const payload = sampleUserStore();
    payload.users[0] = { id: "user_1", email: "   " };
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /users\[0\].*nonempty string "email"/,
    );
  });
  await t.test("session missing required family id", async (t) => {
    const payload = sampleUserStore();
    delete payload.authSessions[0].familyId;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /authSessions\[0\].*nonempty string "familyId"/,
    );
  });
  await t.test("session references unknown user", async (t) => {
    const payload = sampleUserStore();
    payload.authSessions[0].userId = "user_missing";
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /authSessions\[0\] references unknown imported user: user_missing/,
    );
  });
  await t.test("session without an explicit expiry", async (t) => {
    const payload = sampleUserStore();
    delete payload.authSessions[0].expiresAt;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /authSessions\[0\].*finite positive timestamp "expiresAt"/,
    );
  });
  await t.test("session without an explicit revocation state", async (t) => {
    const payload = sampleUserStore();
    delete payload.authSessions[0].revokedAt;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /authSessions\[0\].*finite nonnegative timestamp "revokedAt"/,
    );
  });
  await t.test("session with a malformed expiry", async (t) => {
    const payload = sampleUserStore();
    payload.authSessions[0].expiresAt = "never";
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /authSessions\[0\].*finite positive timestamp "expiresAt"/,
    );
  });
  await t.test("session with an array expiry", async (t) => {
    const payload = sampleUserStore();
    payload.authSessions[0].expiresAt = [1_900_000_000_000];
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /authSessions\[0\].*finite positive timestamp "expiresAt"/,
    );
  });
  await t.test("password token missing hash", async (t) => {
    const payload = sampleUserStore();
    delete payload.passwordResetTokens[0].tokenHash;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /passwordResetTokens\[0\].*nonempty string "tokenHash"/,
    );
  });
  await t.test("password token without an explicit expiry", async (t) => {
    const payload = sampleUserStore();
    delete payload.passwordResetTokens[0].expiresAt;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /passwordResetTokens\[0\].*finite positive timestamp "expiresAt"/,
    );
  });
  await t.test("password token without an explicit consumed state", async (t) => {
    const payload = sampleUserStore();
    delete payload.passwordResetTokens[0].usedAt;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /passwordResetTokens\[0\].*finite nonnegative timestamp "usedAt"/,
    );
  });
  await t.test("password token with a negative consumed timestamp", async (t) => {
    const payload = sampleUserStore();
    payload.passwordResetTokens[0].usedAt = -1;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /passwordResetTokens\[0\].*finite nonnegative timestamp "usedAt"/,
    );
  });
  await t.test("password token with an object consumed timestamp", async (t) => {
    const payload = sampleUserStore();
    payload.passwordResetTokens[0].usedAt = { value: 0 };
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /passwordResetTokens\[0\].*finite nonnegative timestamp "usedAt"/,
    );
  });
  await t.test("email token references unknown user", async (t) => {
    const payload = sampleUserStore();
    payload.emailVerificationTokens[0].userId = "user_missing";
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /emailVerificationTokens\[0\] references unknown imported user: user_missing/,
    );
  });
});

test("[postgres-import] duplicate auth primary keys fail before database calls", async (t) => {
  await t.test("duplicate user id", async (t) => {
    const payload = sampleUserStore();
    payload.users.push({ id: " user_1 ", email: "second@example.com" });
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /duplicate auth user id: user_1/,
    );
  });
  await t.test("duplicate session id", async (t) => {
    const payload = sampleUserStore();
    payload.authSessions.push({
      sessionId: "session_1",
      familyId: "family_2",
      userId: "user_1",
      tokenHash: "session_token_2",
      expiresAt: 1_900_000_000_000,
      revokedAt: 0,
    });
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /duplicate auth session id: session_1/,
    );
  });
  await t.test("duplicate token hash", async (t) => {
    const payload = sampleUserStore();
    payload.emailVerificationTokens[0].tokenHash = "reset_1";
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /duplicate auth token hash: reset_1/,
    );
  });
  await t.test("duplicate normalized email", async (t) => {
    const payload = sampleUserStore();
    payload.users.push({
      id: "user_2",
      email: " WRITER@EXAMPLE.COM ",
      password: {
        salt: ALTERNATE_PASSWORD_SALT,
        hash: TEST_PASSWORD_HASH,
        iterations: 120_000,
      },
    });
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /duplicate normalized auth email: writer@example.com/,
    );
  });
  await t.test("duplicate trimmed Apple subject", async (t) => {
    const payload = sampleUserStore();
    payload.users[0].appleSubject = " apple-shared ";
    payload.users.push({
      id: "user_2",
      email: "second@example.com",
      appleSubject: "apple-shared",
    });
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /duplicate Apple subject: apple-shared/,
    );
  });
});

test("[postgres-import] users require one valid canonical credential and unambiguous aliases", async (t) => {
  await t.test("password and Apple credentials may coexist", async (t) => {
    const payload = sampleUserStore();
    payload.users[0].appleSubject = "apple_subject_1";
    const backendDirectory = makeBackend(t, { "user_store.json": payload });
    const result = await runMigration({
      databaseUrl: "",
      backendDirectory,
      dryRun: true,
      logger: makeLogger(),
    });
    assert.equal(result.totalMigrated, 4);
  });
  await t.test("credentialless user", async (t) => {
    const payload = sampleUserStore();
    delete payload.users[0].password;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /must contain a valid password credential or Apple subject/,
    );
  });
  await t.test("password iteration count must be a primitive positive integer", async (t) => {
    const payload = sampleUserStore();
    payload.users[0].password.iterations = [120_000];
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /password.*iterations.*finite positive integer/,
    );
  });
  await t.test("password iteration count is capped before database access", async (t) => {
    const payload = sampleUserStore();
    payload.users[0].password.iterations = 2_000_001;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /password.*iterations.*at most 2000000/,
    );
  });
  await t.test("password hash must encode the complete PBKDF2 digest", async (t) => {
    const payload = sampleUserStore();
    payload.users[0].password.hash = `${TEST_PASSWORD_HASH}f`;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /password.*hash.*64-character hexadecimal digest/,
    );
  });
  await t.test("password salt length is bounded", async (t) => {
    const payload = sampleUserStore();
    payload.users[0].password.salt = "s".repeat(513);
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /password.*salt.*<= 512 characters/,
    );
  });
  await t.test("conflicting Apple subject aliases", async (t) => {
    const payload = sampleUserStore();
    payload.users[0].appleSubject = "apple_subject_a";
    payload.users[0].apple_subject = "apple_subject_b";
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /conflicting aliases "appleSubject" and "apple_subject"/,
    );
  });
  await t.test("conflicting nested and flat password credentials", async (t) => {
    const payload = sampleUserStore();
    Object.assign(payload.users[0], {
      passwordSalt: ALTERNATE_PASSWORD_SALT,
      passwordHash: TEST_PASSWORD_HASH,
      passwordIterations: 120_000,
    });
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /conflicting nested and flat password credentials/,
    );
  });
});

test("[postgres-import] email verification metadata is canonical and non-contradictory", async (t) => {
  await t.test("missing verification fields normalize to an explicit unverified pair", () => {
    const normalized = validateAuthSnapshot(sampleUserStore());
    assert.deepEqual(
      [normalized.users[0].emailVerified, normalized.users[0].emailVerifiedAt],
      [false, 0],
    );
  });

  await t.test("legacy timestamp-only verification normalizes to an explicit verified pair", () => {
    const payload = sampleUserStore();
    payload.users[0].emailVerifiedAt = 1_900_000_000_000;
    const normalized = validateAuthSnapshot(payload);
    assert.deepEqual(
      [normalized.users[0].emailVerified, normalized.users[0].emailVerifiedAt],
      [true, 1_900_000_000_000],
    );
  });

  await t.test("explicit false cannot carry a positive verification timestamp", async (t) => {
    const payload = sampleUserStore();
    payload.users[0].emailVerified = false;
    payload.users[0].emailVerifiedAt = 1_900_000_000_000;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /contradictory email verification metadata/,
    );
  });

  await t.test("explicit true cannot carry a zero verification timestamp", async (t) => {
    const payload = sampleUserStore();
    payload.users[0].emailVerified = true;
    payload.users[0].emailVerifiedAt = 0;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /contradictory email verification metadata/,
    );
  });

  await t.test("explicit true requires an auditable verification timestamp", async (t) => {
    const payload = sampleUserStore();
    payload.users[0].emailVerified = true;
    await assertRejectedBeforeDatabaseCalls(
      t,
      { "user_store.json": payload },
      /positive "emailVerifiedAt" when emailVerified is true/,
    );
  });
});

test("[postgres-import] legacy flat password aliases normalize to the canonical credential", async (t) => {
  const payload = sampleUserStore();
  payload.users[0] = {
    id: "user_1",
    email: "writer@example.com",
    password_salt: ` ${TEST_PASSWORD_SALT} `,
    password_hash: ` ${TEST_PASSWORD_HASH} `,
    password_iterations: "120000",
  };
  const backendDirectory = makeBackend(t, { "user_store.json": payload });
  let imported = null;

  await runMigration({
    databaseUrl: "postgres://example.invalid/them",
    backendDirectory,
    applySchemaFn: async () => {},
    createPersistenceFn: () => ({ kind: "postgres", put: async () => {}, close: async () => {} }),
    importAuthRecordsFn: async ({ records }) => {
      imported = records;
    },
    logger: makeLogger(),
  });

  const user = imported.find(({ domain }) => domain === "auth_users").value;
  assert.deepEqual(user.password, {
    salt: TEST_PASSWORD_SALT,
    hash: TEST_PASSWORD_HASH,
    iterations: 120_000,
  });
  assert.equal(Object.hasOwn(user, "password_salt"), false);
  assert.equal(Object.hasOwn(user, "password_hash"), false);
  assert.equal(Object.hasOwn(user, "password_iterations"), false);
});

test("[postgres-import] legacy snake_case auth arrays and fields are normalized before import", async (t) => {
  const backendDirectory = makeBackend(t, {
    "user_store.json": {
      users: [{
        id: " user_1 ",
        email: " Writer@Example.COM ",
        apple_subject: " apple_subject_1 ",
        auth_provider: " apple ",
        email_verified: "true",
        email_verified_at: "1900000000000",
      }],
      auth_sessions: [{
        session_id: " session_1 ",
        family_id: " family_1 ",
        user_id: " user_1 ",
        token_hash: " session_token_1 ",
        expires_at: "1900000000000",
        revoked_at: "0",
      }],
      password_reset_tokens: [{
        token_hash: " reset_1 ",
        user_id: " user_1 ",
        expires_at: "1900000000000",
        used_at: "0",
      }],
      email_verification_tokens: [{
        token_hash: " verify_1 ",
        user_id: " user_1 ",
        expires_at: "1900000000000",
        used_at: "0",
      }],
    },
  });
  let imported = null;

  const result = await runMigration({
    databaseUrl: "postgres://example.invalid/them",
    backendDirectory,
    applySchemaFn: async () => {},
    createPersistenceFn: () => ({ kind: "postgres", put: async () => {}, close: async () => {} }),
    importAuthRecordsFn: async ({ records }) => {
      imported = records;
    },
    logger: makeLogger(),
  });

  assert.equal(result.totalMigrated, 4);
  const user = imported.find(({ domain }) => domain === "auth_users").value;
  assert.equal(user.email, "writer@example.com");
  assert.deepEqual(
    [user.appleSubject, user.authProvider, user.emailVerified, user.emailVerifiedAt],
    ["apple_subject_1", "apple", true, 1_900_000_000_000],
  );
  assert.equal(Object.hasOwn(user, "apple_subject"), false);
  assert.equal(Object.hasOwn(user, "auth_provider"), false);
  assert.equal(Object.hasOwn(user, "email_verified"), false);
  assert.equal(Object.hasOwn(user, "email_verified_at"), false);
  const session = imported.find(({ domain }) => domain === "auth_sessions").value;
  assert.deepEqual(
    [session.sessionId, session.familyId, session.userId, session.tokenHash],
    ["session_1", "family_1", "user_1", "session_token_1"],
  );
  assert.deepEqual([session.expiresAt, session.revokedAt], [1_900_000_000_000, 0]);
});
