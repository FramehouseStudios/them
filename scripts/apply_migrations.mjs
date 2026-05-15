#!/usr/bin/env node
//
// apply_migrations.mjs — apply every backend/migrations/*.sql file in
// numeric order, idempotently. Tracks applied migrations in the
// `_schema_migrations` table so re-running is a no-op.
//
// Usage:
//   DATABASE_URL=... node scripts/apply_migrations.mjs
//   DATABASE_URL=... node scripts/apply_migrations.mjs --dry-run
//   DATABASE_URL=... node scripts/apply_migrations.mjs --status
//
// Replaces the partial coverage in scripts/migrate_stores_to_postgres.mjs
// (which only applied migrations/001_init_persistence.sql). This script
// applies all pending migrations.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "backend", "migrations");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const STATUS_ONLY = args.has("--status");

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

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => {
      const fullPath = path.join(MIGRATIONS_DIR, name);
      const sql = fs.readFileSync(fullPath, "utf8");
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

async function applyOne(client, migration) {
  console.log(`> applying ${migration.name} ...`);
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO _schema_migrations (name, checksum) VALUES ($1, $2)",
      [migration.name, migration.checksum]
    );
    await client.query("COMMIT");
    console.log(`  ok`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main() {
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
  try {
    await client.query(TRACKING_TABLE_SQL);
    const applied = await readApplied(client);

    let pendingCount = 0;
    let appliedCount = 0;
    let mismatches = [];

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
      console.error(
        "Migrations are immutable once applied. Create a new migration to amend."
      );
      process.exit(3);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
