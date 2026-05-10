#!/usr/bin/env node
//
// Reverse migration: dump the canonical persistence_* Postgres tables
// back into the legacy backend/*_store.json shapes plus
// knowledge_embeddings_cache.json. Used for:
//   - rolling back a Postgres-canonical deployment to JSON-mode.
//   - local debugging: snapshot prod state into developer-readable files.
//   - disaster recovery: re-seed JSON mode from a Postgres backup.
//
// Usage:
//   DATABASE_URL=... node scripts/dump_stores_to_json.mjs
//   DATABASE_URL=... node scripts/dump_stores_to_json.mjs --backend DIR
//   DATABASE_URL=... node scripts/dump_stores_to_json.mjs --dry-run
//
// The reverse migration is the inverse of the forward shape-extractors
// in migrate_stores_to_postgres.mjs. Round-trip:
//   legacy JSON -> migrate forward -> Postgres -> dump reverse -> JSON
// produces a JSON file equivalent to the original.

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

const DRY_RUN = args.has("--dry-run");

const TARGETS = [
  {
    file: "outbox_store.json",
    domain: "outbox",
    serialize: (records) => ({ items: records.map(({ value }) => value) }),
  },
  {
    file: "user_memory_store.json",
    domain: "user_memory",
    serialize: (records) => {
      const out = { byUserId: {}, byClientToken: {}, byIp: {} };
      let usedBucket = false;
      const flat = {};
      for (const { key, value } of records) {
        const m = key.match(/^(byUserId|byClientToken|byIp):(.+)$/);
        if (m) {
          out[m[1]][m[2]] = value;
          usedBucket = true;
        } else {
          flat[key] = value;
        }
      }
      return usedBucket ? out : flat;
    },
  },
  {
    file: "screenplay_store.json",
    domain: "screenplay",
    serialize: (records) => {
      const out = {};
      for (const { key, value } of records) out[key] = value;
      return out;
    },
  },
  {
    file: "knowledge_embeddings_cache.json",
    domain: "knowledge_embeddings",
    serialize: (records) => {
      const out = {};
      for (const { key, value } of records) out[key] = value;
      return out;
    },
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("error: DATABASE_URL is not set");
    process.exit(2);
  }
  const persistence = createPersistence();
  if (persistence.kind !== "postgres") {
    throw new Error(`expected postgres adapter, got ${persistence.kind}`);
  }

  for (const target of TARGETS) {
    const records = await persistence.list({ domain: target.domain, limit: 10_000 });
    const out = target.serialize(records);
    const file = path.join(backendDir, target.file);
    if (DRY_RUN) {
      console.log(`-> would write ${file}: ${records.length} record(s)`);
      continue;
    }
    fs.writeFileSync(`${file}.tmp.${process.pid}`, JSON.stringify(out, null, 2));
    fs.renameSync(`${file}.tmp.${process.pid}`, file);
    console.log(`wrote ${file}: ${records.length} record(s)`);
  }

  await persistence.close();
}

main().catch((e) => {
  console.error("dump failed:", e?.stack || e?.message || e);
  process.exit(1);
});
