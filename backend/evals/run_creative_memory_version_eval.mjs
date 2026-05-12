#!/usr/bin/env node
//
// T-creative-memory-version-check-eval — pin the `version` field on
// the creative-memory snapshot.
//
// `getCreativeMemoryForPrompt({ userId })` returns either `null`
// (cold user) or an object whose first field is `version`. iOS and
// prompt-assembly both rely on `version` to know which decoding
// path to take. A future change that drops the field (e.g. when
// adding a more domain-specific reader on top) would silently break
// every consumer.
//
// This eval asserts:
//
//   1. cold user → null
//   2. seeded user → object with version === SCHEMA_VERSION (1)
//   3. version remains stable across multiple recordCharacterMention
//      calls (a hot user doesn't bump it)
//   4. version is integer-valued and >= 1 (no nullable / string
//      version)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-eval-mem-version-"));
  return createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
}

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

async function coldUser() {
  const store = freshStore();
  const memory = await store.getCreativeMemoryForPrompt({ userId: "cold" });
  check("cold user returns null (no envelope)", memory === null);
}

async function seededUser() {
  const store = freshStore();
  await store.recordCharacterMention({ userId: "seeded", characterName: "June" });
  const memory = await store.getCreativeMemoryForPrompt({ userId: "seeded" });
  check("seeded user returns a non-null envelope", memory !== null);
  check(
    `envelope has a version field that's a positive integer (got ${memory?.version})`,
    Number.isInteger(memory?.version) && memory.version >= 1,
  );
  check(
    "envelope has version === 1 (current SCHEMA_VERSION)",
    memory?.version === 1,
    `got ${memory?.version}`,
  );
  check("envelope has userId field", typeof memory?.userId === "string" && memory.userId.length > 0);
  check("envelope has updatedAt field (number)", typeof memory?.updatedAt === "number");
}

async function versionStableUnderUpdates() {
  const store = freshStore();
  await store.recordCharacterMention({ userId: "u-stable", characterName: "Iris" });
  const v1 = (await store.getCreativeMemoryForPrompt({ userId: "u-stable" }))?.version;
  await store.recordCharacterMention({ userId: "u-stable", characterName: "Marcus" });
  const v2 = (await store.getCreativeMemoryForPrompt({ userId: "u-stable" }))?.version;
  await store.recordToneSignal({ userId: "u-stable", signal: { emotional_default: "wry" } });
  const v3 = (await store.getCreativeMemoryForPrompt({ userId: "u-stable" }))?.version;
  check(
    `version stable across updates (got v1=${v1}, v2=${v2}, v3=${v3})`,
    v1 === v2 && v2 === v3,
  );
}

await coldUser();
await seededUser();
await versionStableUnderUpdates();

if (!allOK) {
  console.error("creative-memory version eval: FAILED");
  process.exit(1);
}
console.log("creative-memory version eval: OK");
