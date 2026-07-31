#!/usr/bin/env node
//
// backend/scripts/apply_migrations.mjs — apply every backend/migrations/*.sql
// file in numeric order, idempotently and atomically. Tracks applied
// migrations in `_schema_migrations` (name, checksum) so re-running is a no-op.
//
// CANONICAL runner: lives under backend/ so it ships inside the Docker image
// (build context is backend/), which lets render.yaml run it as a
// preDeployCommand (`npm run migrate`). The repo-root scripts/apply_migrations.mjs
// is a thin shim that delegates here, so CI / local invocations share one
// implementation.
//
// Transaction ownership: the RUNNER owns exactly one transaction per migration,
// wrapping BOTH the migration DDL AND the tracking-table INSERT so they commit
// atomically. Migration files historically declared their own BEGIN;/COMMIT;
// which would commit the runner's transaction early and leave the tracking
// INSERT in a separate autocommit — so a crash between them re-applied the
// migration on the next run. We strip standalone transaction-control statements
// before executing; the checksum is computed on the ORIGINAL file text, so
// idempotency tracking of already-applied migrations is unaffected.
//
// Concurrency: a session-level Postgres advisory lock serializes runs, so two
// deploy instances cannot apply migrations at the same time (the second waits,
// then finds everything applied and no-ops).
//
// Failure: any error exits non-zero so the Render predeploy — and thus the
// deployment — fails visibly rather than shipping code ahead of its schema.
//
// Usage:
//   DATABASE_URL=... node scripts/apply_migrations.mjs
//   DATABASE_URL=... node scripts/apply_migrations.mjs --dry-run
//   DATABASE_URL=... node scripts/apply_migrations.mjs --status

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// backend/scripts/ -> backend/migrations/
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "migrations");

// Arbitrary but fixed key so every runner contends for the same advisory lock.
const MIGRATION_ADVISORY_LOCK_KEY = 823641;

const TRACKING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS _schema_migrations (
    name        TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

function checksum(text) {
  return createHash("sha256").update(text).digest("hex");
}

// Remove standalone BEGIN / COMMIT / START TRANSACTION / END statements so the
// runner owns the transaction. Pure + exported for tests. Does NOT touch the
// checksum (computed on original file text).
function stripTransactionControl(sql) {
  return String(sql)
    .split("\n")
    .filter((line) => !/^\s*(BEGIN|COMMIT|END|START\s+TRANSACTION)\s*(WORK|TRANSACTION)?\s*;?\s*$/i.test(line))
    .join("\n");
}

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
      return { name, sql, checksum: checksum(sql) };
    });
}

async function loadPgClient(databaseUrl) {
  const pgModule = await import("pg");
  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

async function readApplied(client) {
  const r = await client.query(
    "SELECT name, checksum, applied_at FROM _schema_migrations ORDER BY name"
  );
  return new Map(r.rows.map((row) => [row.name, row]));
}

// One transaction owns DDL + tracking INSERT: atomic together.
async function applyOne(client, migration) {
  console.log(`> applying ${migration.name} ...`);
  const body = stripTransactionControl(migration.sql);
  await client.query("BEGIN");
  try {
    await client.query(body);
    await client.query(
      "INSERT INTO _schema_migrations (name, checksum) VALUES ($1, $2)",
      [migration.name, migration.checksum]
    );
    await client.query("COMMIT");
    console.log("  ok");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function run(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const DRY_RUN = args.has("--dry-run");
  const STATUS_ONLY = args.has("--status");

  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }

  const migrations = listMigrations();
  if (migrations.length === 0) {
    console.log("No migrations found.");
    return;
  }

  const client = await loadPgClient(databaseUrl);
  let lockHeld = false;
  try {
    // Serialize concurrent runners (e.g. two deploy instances). Blocks until
    // the lock is free; the loser then finds everything applied and no-ops.
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK_KEY]);
    lockHeld = true;

    await client.query(TRACKING_TABLE_SQL);
    const applied = await readApplied(client);

    let pendingCount = 0;
    let appliedCount = 0;
    const mismatches = [];

    for (const m of migrations) {
      const existing = applied.get(m.name);
      if (existing) {
        if (existing.checksum !== m.checksum) {
          mismatches.push({ name: m.name, applied: existing.checksum, current: m.checksum });
        }
        continue;
      }
      pendingCount++;
      if (STATUS_ONLY) {
        console.log(`PENDING ${m.name}`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`would apply ${m.name}`);
        continue;
      }
      await applyOne(client, m);
      appliedCount++;
    }

    console.log("");
    console.log(`migrations total:    ${migrations.length}`);
    console.log(`already applied:     ${migrations.length - pendingCount}`);
    console.log(`pending:             ${pendingCount}`);
    if (!DRY_RUN && !STATUS_ONLY) {
      console.log(`applied this run:    ${appliedCount}`);
    }
    if (mismatches.length > 0) {
      console.error("");
      console.error(`!! ${mismatches.length} migration(s) changed after being applied:`);
      for (const m of mismatches) {
        console.error(`   ${m.name}`);
        console.error(`     applied checksum: ${m.applied}`);
        console.error(`     file checksum:    ${m.current}`);
      }
      console.error("Migrations are immutable once applied. Create a new migration to amend.");
      process.exit(3);
    }
  } finally {
    try {
      if (lockHeld) {
        await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_KEY]);
      }
    } catch {
      // best-effort; the session lock also releases on disconnect
    }
    await client.end();
  }
}

// Auto-run only when invoked directly (node backend/scripts/apply_migrations.mjs
// or `npm run migrate`), NOT when imported by the root shim or a test.
const isDirectEntry = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (isDirectEntry) {
  run().catch((err) => {
    console.error(err.stack || err.message || err);
    process.exit(1);
  });
}

export { run, stripTransactionControl, listMigrations, checksum, MIGRATIONS_DIR };
