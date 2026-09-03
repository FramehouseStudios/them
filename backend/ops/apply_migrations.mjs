#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_MIGRATIONS_DIRECTORY = path.resolve(__dirname, "..", "migrations");
const requireFromBackend = createRequire(path.resolve(__dirname, "..", "package.json"));
const MIGRATION_LOCK_NAME = "io.them.backend.schema-migrations.v1";

const TRACKING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS _schema_migrations (
    name        TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

function checksum(text) {
  return createHash("sha256").update(text).digest("hex");
}

function listMigrations({ migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY } = {}) {
  if (!fs.existsSync(migrationsDirectory)) {
    throw new Error(`migrations directory not found: ${migrationsDirectory}`);
  }
  return fs
    .readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(migrationsDirectory, name), "utf8");
      return { name, sql, checksum: checksum(sql) };
    });
}

function withoutOuterTransaction(sql, migrationName = "migration") {
  const lines = String(sql).split(/\r?\n/);
  const beginIndexes = [];
  const commitIndexes = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*BEGIN;\s*$/i.test(lines[index])) beginIndexes.push(index);
    if (/^\s*COMMIT;\s*$/i.test(lines[index])) commitIndexes.push(index);
  }
  if (
    beginIndexes.length !== 1
    || commitIndexes.length !== 1
    || beginIndexes[0] >= commitIndexes[0]
  ) {
    throw new Error(
      `${migrationName} must contain one outer BEGIN/COMMIT wrapper`,
    );
  }
  lines[beginIndexes[0]] = "";
  lines[commitIndexes[0]] = "";
  return lines.join("\n");
}

async function loadPgClient(databaseUrl) {
  const pgModule = requireFromBackend("pg");
  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

async function readApplied(client) {
  const result = await client.query(
    "SELECT name, checksum, applied_at FROM _schema_migrations ORDER BY name",
  );
  return new Map((result.rows || []).map((row) => [row.name, row]));
}

function checksumMismatchError(mismatches) {
  const details = mismatches.flatMap(({ name, applied, current }) => [
    `  ${name}`,
    `    applied checksum: ${applied}`,
    `    file checksum:    ${current}`,
  ]).join("\n");
  const error = new Error(
    `${mismatches.length} migration(s) changed after being applied:\n${details}\n`
    + "Migrations are immutable once applied. Create a new migration to amend.",
  );
  error.exitCode = 3;
  return error;
}

async function applyOne(client, migration, { createTrackingTable, logger }) {
  logger.log(`> applying ${migration.name} ...`);
  await client.query("BEGIN");
  try {
    if (createTrackingTable) {
      await client.query(TRACKING_TABLE_SQL);
    }
    await client.query(withoutOuterTransaction(migration.sql, migration.name));
    await client.query(
      "INSERT INTO _schema_migrations (name, checksum) VALUES ($1, $2)",
      [migration.name, migration.checksum],
    );
    await client.query("COMMIT");
    logger.log("  ok");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      error.message = `${error.message}; rollback failed: ${rollbackError.message}`;
    }
    throw error;
  }
}

async function runMigrations({
  databaseUrl = process.env.DATABASE_URL || "",
  dryRun = false,
  statusOnly = false,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
  migrations = null,
  clientFactory = loadPgClient,
  logger = console,
} = {}) {
  if (!databaseUrl) {
    const error = new Error("DATABASE_URL is required");
    error.exitCode = 2;
    throw error;
  }

  const resolvedMigrations = migrations ?? listMigrations({ migrationsDirectory });
  if (resolvedMigrations.length === 0) {
    logger.log("No migrations found.");
    return { total: 0, pending: 0, applied: 0 };
  }

  const client = await clientFactory(databaseUrl);
  let lockHeld = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_NAME]);
    lockHeld = true;

    // The bookkeeping table is harmless infrastructure; migration contents
    // and their corresponding bookkeeping rows remain atomic below.
    await client.query(TRACKING_TABLE_SQL);
    const applied = await readApplied(client);
    const mismatches = resolvedMigrations
      .filter((migration) => {
        const existing = applied.get(migration.name);
        return existing && existing.checksum !== migration.checksum;
      })
      .map((migration) => ({
        name: migration.name,
        applied: applied.get(migration.name).checksum,
        current: migration.checksum,
      }));

    // Validate every recorded checksum before applying even the first pending
    // migration. A changed historical file can therefore never accompany a
    // partially advanced schema.
    if (mismatches.length > 0) throw checksumMismatchError(mismatches);

    const pending = resolvedMigrations.filter((migration) => !applied.has(migration.name));
    let appliedCount = 0;
    for (const migration of pending) {
      if (statusOnly) {
        logger.log(`PENDING ${migration.name}`);
      } else if (dryRun) {
        logger.log(`would apply ${migration.name}`);
      } else {
        await applyOne(client, migration, {
          createTrackingTable: false,
          logger,
        });
        appliedCount += 1;
      }
    }

    logger.log("");
    logger.log(`migrations total:    ${resolvedMigrations.length}`);
    logger.log(`already applied:     ${resolvedMigrations.length - pending.length}`);
    logger.log(`pending:             ${pending.length}`);
    if (!dryRun && !statusOnly) logger.log(`applied this run:    ${appliedCount}`);
    return { total: resolvedMigrations.length, pending: pending.length, applied: appliedCount };
  } finally {
    if (lockHeld) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_NAME]);
      } catch (error) {
        logger.error?.("failed to release migration advisory lock:", error?.message || error);
      }
    }
    await client.end();
  }
}

async function runCli({ argv = process.argv.slice(2), logger = console } = {}) {
  const args = new Set(argv);
  try {
    await runMigrations({
      dryRun: args.has("--dry-run"),
      statusOnly: args.has("--status"),
      logger,
    });
    return 0;
  } catch (error) {
    logger.error(error?.stack || error?.message || error);
    return Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

export {
  DEFAULT_MIGRATIONS_DIRECTORY,
  MIGRATION_LOCK_NAME,
  TRACKING_TABLE_SQL,
  applyOne,
  checksum,
  listMigrations,
  runCli,
  runMigrations,
  withoutOuterTransaction,
};
