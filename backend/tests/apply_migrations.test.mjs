import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  runMigrations,
  withoutOuterTransaction,
} from "../ops/apply_migrations.mjs";

function quietLogger() {
  return { log() {}, error() {} };
}

function migration(name, sql, migrationChecksum = `checksum-${name}`) {
  return { name, sql, checksum: migrationChecksum };
}

function createClient({ appliedRows = [], failTrackingInsert = false } = {}) {
  const queries = [];
  let ended = false;
  return {
    queries,
    get ended() { return ended; },
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/^SELECT name, checksum, applied_at FROM _schema_migrations/.test(sql)) {
        return { rows: appliedRows };
      }
      if (failTrackingInsert && /^INSERT INTO _schema_migrations/.test(sql)) {
        throw new Error("tracking insert failed");
      }
      return { rows: [] };
    },
    async end() { ended = true; },
  };
}

test("[apply-migrations] schema and tracking row share one transaction", async () => {
  const client = createClient();
  const sql = "-- migration\nBEGIN;\nCREATE TABLE example (id TEXT);\nCOMMIT;\n";

  await runMigrations({
    databaseUrl: "postgres://test",
    migrations: [migration("001_example.sql", sql)],
    clientFactory: async () => client,
    logger: quietLogger(),
  });

  const statements = client.queries.map(({ sql: statement }) => statement);
  const beginIndex = statements.indexOf("BEGIN");
  const schemaIndex = statements.findIndex((statement) => /CREATE TABLE example/.test(statement));
  const trackingIndex = statements.findIndex((statement) => /^INSERT INTO _schema_migrations/.test(statement));
  const commitIndex = statements.indexOf("COMMIT");
  assert.ok(beginIndex < schemaIndex && schemaIndex < trackingIndex && trackingIndex < commitIndex);
  assert.doesNotMatch(statements[schemaIndex], /(^|\n)\s*BEGIN;/i);
  assert.doesNotMatch(statements[schemaIndex], /(^|\n)\s*COMMIT;/i);
  assert.equal(client.ended, true);
});

test("[apply-migrations] tracking failure rolls back the schema transaction", async () => {
  const client = createClient({ failTrackingInsert: true });
  await assert.rejects(
    runMigrations({
      databaseUrl: "postgres://test",
      migrations: [migration(
        "001_example.sql",
        "BEGIN;\nCREATE TABLE example (id TEXT);\nCOMMIT;\n",
      )],
      clientFactory: async () => client,
      logger: quietLogger(),
    }),
    /tracking insert failed/,
  );
  assert.ok(client.queries.some(({ sql }) => sql === "ROLLBACK"));
  assert.equal(client.queries.some(({ sql }) => sql === "COMMIT"), false);
  assert.equal(client.ended, true);
});

test("[apply-migrations] checksum mismatch fails before any pending migration", async () => {
  const client = createClient({
    appliedRows: [{ name: "001_existing.sql", checksum: "old-checksum" }],
  });
  await assert.rejects(
    runMigrations({
      databaseUrl: "postgres://test",
      migrations: [
        migration("001_existing.sql", "BEGIN;\nSELECT 1;\nCOMMIT;\n", "new-checksum"),
        migration("002_pending.sql", "BEGIN;\nSELECT 2;\nCOMMIT;\n"),
      ],
      clientFactory: async () => client,
      logger: quietLogger(),
    }),
    (error) => error.exitCode === 3 && /changed after being applied/.test(error.message),
  );
  assert.equal(client.queries.some(({ sql }) => sql === "BEGIN"), false);
  assert.equal(client.queries.some(({ sql }) => /SELECT 2/.test(sql)), false);
  assert.equal(client.ended, true);
});

test("[apply-migrations] migration files must retain their direct-run transaction wrapper", () => {
  assert.throws(
    () => withoutOuterTransaction("CREATE TABLE example (id TEXT);", "bad.sql"),
    /must contain one outer BEGIN\/COMMIT wrapper/,
  );
});

test("[apply-migrations] root operator command delegates to the in-image runner", () => {
  const wrapper = readFileSync(new URL("../../scripts/apply_migrations.mjs", import.meta.url), "utf8");
  assert.match(wrapper, /\.\.\/backend\/ops\/apply_migrations\.mjs/);
});
