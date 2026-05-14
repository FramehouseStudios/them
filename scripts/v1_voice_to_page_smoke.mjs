#!/usr/bin/env node
//
// scripts/v1_voice_to_page_smoke.mjs
//
// V1 voice-to-page smoke. Deterministic, no external APIs, no network.
//
// Why: docs/v1-definition.md (line 26) lists "Manual smoke: record
// voice -> get reply -> hear reply -> saved turn" as a V1 talk-
// pipeline checklist item. The full manual smoke needs OPENAI_API_KEY
// + a real audio file. This script is the **automatable subset**:
// given a known-text simulated STT transcript, run it through prompt
// assembly and verify the canonical prompt shape that the LLM would
// see is stable across runs.
//
// Catches:
//   - prompt-assembly regressions (re-ordered blocks, missing
//     <session> on a non-cold turn, leaking persona into memory, etc.)
//   - creative-memory rendering regressions (character voice missing)
//   - non-determinism (same fixture → different prompt on rerun)
//
// Does NOT catch:
//   - real STT errors (no audio)
//   - real LLM behavior (no API call)
//   - real TTS regressions (no audio out)
//
// Pair with the full backend/smoke.sh for end-to-end coverage. This
// script is the cheap fast tripwire that fails fast when the prompt
// path drifts.
//
// Usage:
//   node scripts/v1_voice_to_page_smoke.mjs
//   node scripts/v1_voice_to_page_smoke.mjs --json
//   node scripts/v1_voice_to_page_smoke.mjs --fixture=backend/fixtures/v1_voice_to_page.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildModelPrompt } from "../backend/lib/prompt_assembly.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.slice(`--${name}=`.length) : fallback;
}

const fixturePath = path.resolve(
  repoRoot,
  arg("fixture", "backend/fixtures/v1_voice_to_page.json"),
);
const jsonOutput = process.argv.includes("--json");

if (!fs.existsSync(fixturePath)) {
  console.error(`v1-voice-to-page-smoke: fixture not found: ${fixturePath}`);
  process.exit(2);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

// 1. Build the model prompt the LLM would see if this were a real
//    talk-pipeline turn (sans STT call, sans LLM call).
const promptArgs = {
  persona: fixture.persona,
  creativeMemory: fixture.creativeMemory,
  sessionContext: fixture.sessionContext,
  acceptedTwists: fixture.acceptedTwists || [],
  blockCoaching: fixture.blockCoaching || "",
  userInput: fixture.userInput,
};
const prompt = buildModelPrompt(promptArgs);

// 2. Verify the prompt contains every expected substring.
const findings = [];
for (const needle of fixture.expected_prompt_contains || []) {
  if (!prompt.includes(needle)) {
    findings.push({ kind: "missing_substring", needle });
  }
}

// 3. Verify the prompt has the expected substring ordering.
let cursor = 0;
for (const needle of fixture.expected_prompt_ordering || []) {
  const idx = prompt.indexOf(needle, cursor);
  if (idx < 0) {
    findings.push({ kind: "missing_in_order", needle, lastCursor: cursor });
    break;
  }
  cursor = idx + needle.length;
}

// 4. Determinism: run buildModelPrompt twice on the same input;
//    bytes must match.
const promptB = buildModelPrompt(promptArgs);
if (prompt !== promptB) {
  findings.push({
    kind: "determinism_violation",
    firstByteDiff: firstDiffOffset(prompt, promptB),
  });
}

function firstDiffOffset(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) if (a[i] !== b[i]) return i;
  return len;
}

if (jsonOutput) {
  console.log(JSON.stringify({
    fixture: path.relative(repoRoot, fixturePath),
    promptLength: prompt.length,
    findings,
    pass: findings.length === 0,
  }, null, 2));
} else {
  console.log(`v1-voice-to-page-smoke`);
  console.log(`  fixture: ${path.relative(repoRoot, fixturePath)}`);
  console.log(`  prompt length: ${prompt.length} chars`);
  console.log(`  contains checks: ${(fixture.expected_prompt_contains || []).length}`);
  console.log(`  ordering checks: ${(fixture.expected_prompt_ordering || []).length}`);
  console.log(`  determinism: ${prompt === promptB ? "ok" : "FAIL"}`);
  if (findings.length === 0) {
    console.log("  result: PASS");
  } else {
    console.log("  result: FAIL");
    for (const f of findings) {
      console.log(`    - ${f.kind}: ${JSON.stringify(f)}`);
    }
  }
}

process.exit(findings.length === 0 ? 0 : 1);
