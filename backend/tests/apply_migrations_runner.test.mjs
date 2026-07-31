// T-migration-runner — unit coverage for the atomic migration runner's pure
// logic. The DB-dependent path (advisory lock, atomic apply) needs Postgres and
// is exercised in deploy/integration; here we lock down the transaction-
// ownership fix and migration discovery, which are what make applies atomic.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  stripTransactionControl,
  listMigrations,
  checksum,
} from "../scripts/apply_migrations.mjs";

test("[migrate] strips standalone transaction control so the runner owns the tx", () => {
  const sql = [
    "-- a migration",
    "BEGIN;",
    "CREATE TABLE IF NOT EXISTS x (id TEXT PRIMARY KEY);",
    "CREATE INDEX IF NOT EXISTS x_idx ON x (id);",
    "COMMIT;",
    "",
  ].join("\n");
  const out = stripTransactionControl(sql);
  assert.ok(!/^\s*BEGIN\s*;/im.test(out), "BEGIN removed");
  assert.ok(!/^\s*COMMIT\s*;/im.test(out), "COMMIT removed");
  assert.match(out, /CREATE TABLE IF NOT EXISTS x/, "DDL preserved");
  assert.match(out, /CREATE INDEX IF NOT EXISTS x_idx/, "index DDL preserved");
});

test("[migrate] does not strip BEGIN/COMMIT that appear inside other statements", () => {
  // Only standalone control lines are removed; a column named 'begin' or text
  // must survive.
  const sql = "CREATE TABLE t (begin_at TIMESTAMPTZ);\nINSERT INTO t VALUES (NOW());";
  const out = stripTransactionControl(sql);
  assert.match(out, /begin_at TIMESTAMPTZ/);
  assert.match(out, /INSERT INTO t/);
});

test("[migrate] checksum is stable and computed on original text", () => {
  const a = checksum("BEGIN;\nCREATE TABLE x();\nCOMMIT;\n");
  const b = checksum("BEGIN;\nCREATE TABLE x();\nCOMMIT;\n");
  assert.equal(a, b);
  // Different text -> different checksum.
  assert.notEqual(a, checksum("CREATE TABLE x();\n"));
});

test("[migrate] discovers the real migrations in sorted, numeric order", () => {
  const names = listMigrations().map((m) => m.name);
  assert.ok(names.length >= 10, "found the migration set");
  assert.deepEqual([...names].sort(), names, "returned already sorted");
  assert.ok(names.includes("010_auth_identity_uniqueness.sql"));
  // Every real migration file currently declares its own BEGIN/COMMIT, which
  // the runner must strip — assert the fix actually applies to them.
  for (const m of listMigrations()) {
    const stripped = stripTransactionControl(m.sql);
    assert.ok(!/^\s*(BEGIN|COMMIT)\s*;/im.test(stripped), `${m.name}: tx control stripped`);
  }
});
