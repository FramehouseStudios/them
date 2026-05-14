#!/usr/bin/env node
//
// scripts/v1_screenplay_smoke.mjs
//
// V1 screenplay export smoke. Deterministic, no external APIs.
//
// docs/v1-definition.md line 39: "Manual smoke: create project ->
// write scene -> save -> export -> reopen." This script is the
// automatable export+reopen subset: given a canonical screenplay
// fixture, run `exportToFountain(...)` and verify the resulting
// Fountain text:
//
//   1. Contains every expected substring (title, scenes, dialogue).
//   2. Preserves canonical ordering (title → first scene →
//      character cue → dialogue → second scene).
//   3. Is deterministic (two consecutive runs produce identical
//      bytes).
//
// Catches:
//   - Fountain emitter regressions (scene heading format,
//     character cue casing, dialogue indentation, title-page
//     order).
//   - Non-determinism in the export path.
//
// Does NOT catch:
//   - iOS-side export download behavior.
//   - PDF export (separate path).
//   - Reopening through the Fountain *import* path (test fixture
//     for that lives in the import path's own tests).
//
// Usage:
//   node scripts/v1_screenplay_smoke.mjs
//   node scripts/v1_screenplay_smoke.mjs --json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { exportToFountain } from "../backend/lib/fountain_export.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.slice(`--${name}=`.length) : fallback;
}

const fixturePath = path.resolve(
  repoRoot,
  arg("fixture", "backend/fixtures/v1_screenplay_export.json"),
);
const jsonOutput = process.argv.includes("--json");

if (!fs.existsSync(fixturePath)) {
  console.error(`v1-screenplay-smoke: fixture not found: ${fixturePath}`);
  process.exit(2);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const fountainA = exportToFountain(fixture.screenplay || {});
const fountainB = exportToFountain(fixture.screenplay || {});

const findings = [];
for (const needle of fixture.expected_fountain_contains || []) {
  if (!fountainA.includes(needle)) {
    findings.push({ kind: "missing_substring", needle });
  }
}
let cursor = 0;
for (const needle of fixture.expected_fountain_ordering || []) {
  const idx = fountainA.indexOf(needle, cursor);
  if (idx < 0) {
    findings.push({ kind: "missing_in_order", needle, lastCursor: cursor });
    break;
  }
  cursor = idx + needle.length;
}
if (fountainA !== fountainB) {
  findings.push({ kind: "determinism_violation" });
}

if (jsonOutput) {
  console.log(JSON.stringify({
    fixture: path.relative(repoRoot, fixturePath),
    fountainBytes: fountainA.length,
    findings,
    pass: findings.length === 0,
  }, null, 2));
} else {
  console.log("v1-screenplay-smoke");
  console.log(`  fixture: ${path.relative(repoRoot, fixturePath)}`);
  console.log(`  fountain bytes: ${fountainA.length}`);
  console.log(`  contains checks: ${(fixture.expected_fountain_contains || []).length}`);
  console.log(`  ordering checks: ${(fixture.expected_fountain_ordering || []).length}`);
  console.log(`  determinism: ${fountainA === fountainB ? "ok" : "FAIL"}`);
  if (findings.length === 0) {
    console.log("  result: PASS");
  } else {
    console.log("  result: FAIL");
    for (const f of findings) console.log(`    - ${f.kind}: ${JSON.stringify(f)}`);
  }
}

process.exit(findings.length === 0 ? 0 : 1);
