#!/usr/bin/env node
//
// scripts/v1_memory_recall_smoke.mjs
//
// V1 memory recall smoke. Deterministic, no external APIs.
//
// docs/v1-definition.md line 55: "Manual smoke: mention character ->
// later suggestion recalls them." This script is the automatable
// subset: record a character mention, then read the creative-memory-
// for-prompt payload back, and verify the character appears in the
// prompt-ready summary.
//
// Catches:
//   - Creative-memory write regressions (character not persisted).
//   - Creative-memory read regressions (character missing from
//     prompt payload).
//   - Sanitize-on-read regressions that drop fields iOS depends on.
//
// Does NOT catch:
//   - LLM behavior on the prompt (no API call).
//   - iOS-side rendering of the memory.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCreativeMemoryStore } from "../backend/lib/creative_memory_store.js";
import { createJsonPersistence } from "../backend/lib/persistence_json.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const jsonOutput = process.argv.includes("--json");

async function run() {
  const persistRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-v1-memory-recall-"));
  const persistence = createJsonPersistence({ jsonRoot: persistRoot });
  const store = createCreativeMemoryStore({ persistence });

  const findings = [];
  const userId = "smoke_user_1";

  // 1. Initial state: no memory for cold user.
  const cold = await store.getCreativeMemoryForPrompt({ userId });
  if (cold !== null) {
    findings.push({ kind: "cold_state_not_null", got: typeof cold });
  }

  // 2. Record a character mention.
  await store.recordCharacterMention({
    userId,
    characterName: "JUNE",
    voice: "wry",
    tags: ["protagonist"],
    source: "smoke",
  });

  // 3. Read back the prompt-ready memory.
  const warm = await store.getCreativeMemoryForPrompt({ userId });
  if (!warm) {
    findings.push({ kind: "warm_state_null" });
  } else {
    const characters = Array.isArray(warm.characters) ? warm.characters : [];
    const june = characters.find((c) => (c.name || "").toUpperCase() === "JUNE");
    if (!june) {
      findings.push({ kind: "character_missing_after_mention", got: characters.map((c) => c.name) });
    } else {
      if (june.voice !== "wry") {
        findings.push({ kind: "voice_lost_on_read", got: june.voice });
      }
      const tags = Array.isArray(june.tags) ? june.tags : [];
      if (!tags.includes("protagonist")) {
        findings.push({ kind: "tag_lost_on_read", got: tags });
      }
    }
  }

  // 4. Determinism: two reads on the same store must return the
  //    same prompt-ready payload.
  const a = await store.getCreativeMemoryForPrompt({ userId });
  const b = await store.getCreativeMemoryForPrompt({ userId });
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    findings.push({ kind: "non_deterministic_read" });
  }

  // 5. Isolation: a different userId must not see JUNE.
  const otherUser = await store.getCreativeMemoryForPrompt({ userId: "smoke_user_2" });
  if (otherUser !== null) {
    findings.push({ kind: "isolation_violation_other_user_has_memory" });
  }

  return { findings, recallSnapshot: warm };
}

run().then(({ findings, recallSnapshot }) => {
  if (jsonOutput) {
    console.log(JSON.stringify({
      pass: findings.length === 0,
      findings,
      recallSnapshot,
    }, null, 2));
  } else {
    console.log("v1-memory-recall-smoke");
    console.log(`  cold-state check, character-record check, recall check, determinism, isolation`);
    if (findings.length === 0) {
      console.log("  result: PASS");
      const june = (recallSnapshot?.characters || []).find((c) => (c.name || "").toUpperCase() === "JUNE");
      if (june) console.log(`  recalled: ${june.name} (voice="${june.voice}", tags=${JSON.stringify(june.tags || [])})`);
    } else {
      console.log("  result: FAIL");
      for (const f of findings) console.log(`    - ${f.kind}: ${JSON.stringify(f)}`);
    }
  }
  process.exit(findings.length === 0 ? 0 : 1);
}).catch((err) => {
  console.error("v1-memory-recall-smoke: error", err);
  process.exit(2);
});
