#!/usr/bin/env node
//
// scripts/coordination_state_schema_check.mjs
//
// Asserts that `docs/coordination.json` parses and conforms to the
// shape the CLI and inbox files depend on. Catches the class of bugs
// where an agent hand-edits the file and breaks downstream readers.
//
// Required top-level fields:
//   - schemaVersion: number (>= 1)
//   - updatedAt: string (ISO-8601)
//   - updatedBy: string
//   - openPullRequests: array of PR objects
//   - blockers: array of blocker objects
//   - decisionsPending: array of decision objects (may be empty)
//
// PR object required fields:
//   - number: integer
//   - title: non-empty string
//   - owner: "support" | "codex" | "human"
//   - tier: 1 | 2 | 3
//   - status: non-empty string
//   - branch: non-empty string
//
// Exits non-zero on any drift.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const FILE = path.join(repoRoot, "docs", "coordination.json");

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

let state;
try {
  state = JSON.parse(fs.readFileSync(FILE, "utf8"));
  console.log(`PASS  docs/coordination.json parses`);
} catch (e) {
  console.error(`FAIL  docs/coordination.json parses\n  ${e?.message}`);
  process.exit(1);
}

check("schemaVersion is a number >= 1", typeof state.schemaVersion === "number" && state.schemaVersion >= 1, `got ${state.schemaVersion}`);
check("updatedAt is an ISO-8601 string", typeof state.updatedAt === "string" && !Number.isNaN(Date.parse(state.updatedAt)), `got ${state.updatedAt}`);
check("updatedBy is a non-empty string", typeof state.updatedBy === "string" && state.updatedBy.length > 0);
check("openPullRequests is an array", Array.isArray(state.openPullRequests));
check("blockers is an array", Array.isArray(state.blockers));
check("decisionsPending is an array", Array.isArray(state.decisionsPending));

const allowedOwners = new Set(["support", "codex", "human"]);
const allowedTiers = new Set([1, 2, 3]);

if (Array.isArray(state.openPullRequests)) {
  for (const pr of state.openPullRequests) {
    const label = `pr #${pr?.number ?? "??"}`;
    check(`${label}: number is integer`, Number.isInteger(pr?.number));
    check(`${label}: title non-empty`, typeof pr?.title === "string" && pr.title.length > 0);
    check(`${label}: owner is support|codex|human`, allowedOwners.has(pr?.owner), `got ${pr?.owner}`);
    check(`${label}: tier in {1,2,3}`, allowedTiers.has(pr?.tier), `got ${pr?.tier}`);
    check(`${label}: status non-empty`, typeof pr?.status === "string" && pr.status.length > 0);
    check(`${label}: branch non-empty`, typeof pr?.branch === "string" && pr.branch.length > 0);
  }
}

if (Array.isArray(state.blockers)) {
  for (const b of state.blockers) {
    const label = `blocker ${b?.id ?? "??"}`;
    check(`${label}: id non-empty`, typeof b?.id === "string" && b.id.length > 0);
    check(`${label}: owner is support|codex|human`, allowedOwners.has(b?.owner), `got ${b?.owner}`);
    check(`${label}: summary non-empty`, typeof b?.summary === "string" && b.summary.length > 0);
  }
}

if (!allOK) {
  console.error("coordination-state-schema-check: FAILED");
  process.exit(1);
}
console.log("coordination-state-schema-check: OK");
