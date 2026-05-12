#!/usr/bin/env node
//
// T-creative-memory-store-eviction-eval — pathological-input guard
// on the creative-memory character roster.
//
// `recordCharacterMention({ userId, characterName })` is called from
// /talk turn handling and from the iOS character mention path. A
// heavy user who reuses the same character name dozens of times
// must not grow the array unbounded — duplicates should de-dup by
// name; new names should accumulate but the in-prompt projection
// (`serializeCharacters`) caps at 8.
//
// This eval pins:
//   1. 50 mentions of the same name → 1 character record (de-duped)
//   2. 200 unique names → store caps at CHARACTERS_MAX=32, keeping
//      the 32 most-recently-referenced; the 168 oldest are dropped
//   3. Repeated mentions update `last_referenced` (the projection
//      orders by it)
//   4. Empty / missing characterName is a no-op
//   5. Mention of "  June  " (whitespace) matches "June" on de-dup

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-eval-mem-evict-"));
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

async function sameNameDedupes() {
  const store = freshStore();
  for (let i = 0; i < 50; i += 1) {
    await store.recordCharacterMention({ userId: "u-dup", characterName: "June" });
  }
  const memory = await store.getCreativeMemoryForPrompt({ userId: "u-dup" });
  check(
    `50 mentions of "June" → exactly 1 character record (got ${memory?.characters?.length})`,
    memory?.characters?.length === 1,
  );
  check(
    "the single record is named June",
    memory?.characters?.[0]?.name === "June",
  );
}

async function whitespaceNameDedupes() {
  const store = freshStore();
  await store.recordCharacterMention({ userId: "u-ws", characterName: "June" });
  await store.recordCharacterMention({ userId: "u-ws", characterName: "  June  " });
  await store.recordCharacterMention({ userId: "u-ws", characterName: "June" });
  const memory = await store.getCreativeMemoryForPrompt({ userId: "u-ws" });
  check(
    `whitespace-padded "June" de-dupes (got ${memory?.characters?.length})`,
    memory?.characters?.length === 1,
  );
}

async function emptyNameIsNoOp() {
  const store = freshStore();
  const r1 = await store.recordCharacterMention({ userId: "u-empty", characterName: "" });
  const r2 = await store.recordCharacterMention({ userId: "u-empty", characterName: "   " });
  const r3 = await store.recordCharacterMention({ userId: "u-empty" }); // undefined
  check("empty name returns skipped", r1?.action === "skipped");
  check("whitespace-only name returns skipped", r2?.action === "skipped");
  check("undefined name returns skipped", r3?.action === "skipped");
  const memory = await store.getCreativeMemoryForPrompt({ userId: "u-empty" });
  check("no character record created for empty/whitespace/undefined", memory === null || !memory?.characters?.length);
}

async function unique200CapsAtStoreLimit() {
  // Store-level CHARACTERS_MAX = 32 — see lib/creative_memory_store.js.
  // Beyond that the store sorts by last_referenced desc and trims.
  // This is the load-bearing safety net for "user mentions a new
  // character every line of dialogue" pathological inputs.
  const STORE_CAP = 32;
  const store = freshStore();
  for (let i = 0; i < 200; i += 1) {
    await store.recordCharacterMention({
      userId: "u-many",
      characterName: `Char${i.toString().padStart(3, "0")}`,
    });
  }
  const memory = await store.getCreativeMemoryForPrompt({ userId: "u-many" });
  check(
    `200 unique names capped at ${STORE_CAP} (got ${memory?.characters?.length})`,
    memory?.characters?.length === STORE_CAP,
  );
  // The 32 kept must be the most recent — none of Char000-Char167.
  const names = new Set((memory?.characters || []).map((c) => c.name));
  check(
    "the kept names include the most recently mentioned (Char199)",
    names.has("Char199"),
  );
  check(
    "the kept names exclude the oldest (Char000)",
    !names.has("Char000"),
  );
}

async function lastReferencedUpdates() {
  const store = freshStore();
  await store.recordCharacterMention({ userId: "u-recent", characterName: "Old" });
  // Tiny delay so timestamps differ; nowMs is internal but in
  // practice resolves to current Date.now().
  await new Promise((resolve) => setTimeout(resolve, 5));
  await store.recordCharacterMention({ userId: "u-recent", characterName: "New" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await store.recordCharacterMention({ userId: "u-recent", characterName: "Old" });
  const memory = await store.getCreativeMemoryForPrompt({ userId: "u-recent" });
  const oldRec = memory?.characters?.find((c) => c.name === "Old");
  const newRec = memory?.characters?.find((c) => c.name === "New");
  check("Old has more recent last_referenced than New after re-mention",
    oldRec?.last_referenced > newRec?.last_referenced,
    `Old=${oldRec?.last_referenced} New=${newRec?.last_referenced}`,
  );
}

await sameNameDedupes();
await whitespaceNameDedupes();
await emptyNameIsNoOp();
await unique200CapsAtStoreLimit();
await lastReferencedUpdates();

if (!allOK) {
  console.error("creative-memory eviction eval: FAILED");
  process.exit(1);
}
console.log("creative-memory eviction eval: OK");
