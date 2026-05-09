#!/usr/bin/env node
//
// Forward migration: read legacy backend/*_store.json files plus the
// optional knowledge_embeddings_cache.json and load them into the
// canonical persistence_* Postgres tables.
//
// Usage:
//   DATABASE_URL=... node scripts/migrate_stores_to_postgres.mjs
//   DATABASE_URL=... node scripts/migrate_stores_to_postgres.mjs --schema-only
//   DATABASE_URL=... node scripts/migrate_stores_to_postgres.mjs --dry-run
//
// Flags:
//   --schema-only   Apply migrations/001_init_persistence.sql, no data load.
//   --dry-run       Report counts that would be migrated; do not write.
//   --backend DIR   Backend directory (defaults to ./backend).
//
// The script is idempotent — running it twice on the same data
// produces the same Postgres state.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createPersistence } from "../backend/lib/persistence_adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = new Set(process.argv.slice(2));
const backendArgIdx = process.argv.indexOf("--backend");
const backendDir = backendArgIdx >= 0
  ? path.resolve(process.argv[backendArgIdx + 1])
  : path.resolve(__dirname, "..", "backend");

const SCHEMA_ONLY = args.has("--schema-only");
const DRY_RUN = args.has("--dry-run");

function readJsonFileIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const text = fs.readFileSync(file, "utf8");
    if (!text.trim()) return null;
    return JSON.parse(text);
  } catch (e) {
    console.error(`! cannot parse ${file}: ${e.message}`);
    return null;
  }
}

// Mapping: legacy file -> domain -> shape extractor.
// Each extractor returns an iterable of [key, value] pairs.
const SOURCES = [
  {
    file: "outbox_store.json",
    domain: "outbox",
    extract: (data) => {
      if (!data || typeof data !== "object") return [];
      // Legacy outbox stored items keyed by id, possibly under .items.
      const items = Array.isArray(data) ? data
        : Array.isArray(data.items) ? data.items
        : null;
      if (items) {
        return items.map((item) => [String(item?.id ?? item?.key ?? ""), item])
          .filter(([k]) => k.length > 0);
      }
      // Treat as flat key-object map.
      return Object.entries(data);
    },
  },
  {
    file: "user_memory_store.json",
    domain: "user_memory",
    extract: (data) => {
      if (!data || typeof data !== "object") return [];
      // Memory commonly stored under nested maps by-userId / by-ip / by-clientToken.
      const out = [];
      const buckets = ["byUserId", "byClientToken", "byIp"];
      let hadBucket = false;
      for (const bucket of buckets) {
        const map = data[bucket];
        if (!map || typeof map !== "object") continue;
        hadBucket = true;
        for (const [id, value] of Object.entries(map)) {
          out.push([`${bucket}:${id}`, value]);
        }
      }
      if (!hadBucket) {
        return Object.entries(data);
      }
      return out;
    },
  },
  {
    file: "screenplay_store.json",
    domain: "screenplay",
    extract: (data) => {
      if (!data || typeof data !== "object") return [];
      // Screenplays keyed by owner|project; legacy schema is flat object.
      return Object.entries(data);
    },
  },
  {
    file: "knowledge_embeddings_cache.json",
    domain: "knowledge_embeddings",
    extract: (data) => {
      if (!data || typeof data !== "object") return [];
      return Object.entries(data);
    },
  },
];

async function applySchema() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to apply schema");
  }
  const pg = await import("pg");
  const { Pool } = pg.default ?? pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const sqlPath = path.resolve(__dirname, "..", "backend", "migrations", "001_init_persistence.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    console.log("schema applied:", sqlPath);
  } finally {
    await pool.end();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("error: DATABASE_URL is not set");
    process.exit(2);
  }

  await applySchema();
  if (SCHEMA_ONLY) return;

  const persistence = createPersistence();
  if (persistence.kind !== "postgres") {
    throw new Error(`expected postgres adapter, got ${persistence.kind}`);
  }

  let totalMigrated = 0;
  for (const source of SOURCES) {
    const file = path.join(backendDir, source.file);
    const data = readJsonFileIfExists(file);
    if (data == null) {
      console.log(`-  ${source.file} not present; skipping`);
      continue;
    }
    const pairs = Array.from(source.extract(data));
    console.log(`-> ${source.file} -> domain "${source.domain}": ${pairs.length} record(s)`);
    if (DRY_RUN) {
      totalMigrated += pairs.length;
      continue;
    }
    for (const [key, value] of pairs) {
      try {
        await persistence.put({ domain: source.domain, key, value });
        totalMigrated += 1;
      } catch (e) {
        console.error(`!  put ${source.domain}:${key} failed: ${e.message}`);
      }
    }
  }

  await persistence.close();
  console.log(`done. ${DRY_RUN ? "would migrate" : "migrated"} ${totalMigrated} record(s).`);
}

main().catch((e) => {
  console.error("migration failed:", e?.stack || e?.message || e);
  process.exit(1);
});
