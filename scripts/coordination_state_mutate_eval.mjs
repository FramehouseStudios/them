#!/usr/bin/env node
//
// scripts/coordination_state_mutate_eval.mjs
//
// Round-trip eval: runs each mutating subcommand of
// coordination_state.mjs (add-pr, set-pr, close-pr, add-blocker,
// clear-blocker, add-decision, clear-decision) against a temp
// fixture, and asserts the resulting `docs/coordination.json`
// still passes the schema check after every mutation.
//
// Sits next to the existing schema check (PR #117) + the in-CLI
// `validate` subcommand (PR #144). Catches the regression class
// where a future change to the mutating commands silently
// produces a file that the validator rejects.
//
// Default mode prints findings + exits 0. `--strict` exits 1.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliScript = path.resolve(__dirname, "coordination_state.mjs");

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

// Build a tempdir mirroring the script's expected layout:
//   tmp/scripts/coordination_state.mjs (copy)
//   tmp/docs/coordination.json (seed)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-coord-mutate-"));
fs.mkdirSync(path.join(tmp, "scripts"));
fs.mkdirSync(path.join(tmp, "docs"));
fs.copyFileSync(cliScript, path.join(tmp, "scripts", "coordination_state.mjs"));

// Seed minimal valid state.
const seed = {
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  updatedBy: "test",
  openPullRequests: [],
  blockers: [],
  decisionsPending: [],
  endpointsAwaitingIosConsumer: [],
};
fs.writeFileSync(path.join(tmp, "docs", "coordination.json"), JSON.stringify(seed, null, 2) + "\n");

function runCli(args) {
  const r = spawnSync("node", [path.join(tmp, "scripts", "coordination_state.mjs"), ...args], {
    encoding: "utf8",
  });
  return r;
}

function assertValid(label) {
  const r = runCli(["validate"]);
  check(`${label}: validate exits 0`, r.status === 0, `stderr:\n${r.stderr}`);
}

// 1. add-pr with structured blocker metadata → validate
let r = runCli([
  "add-pr",
  "--number=42",
  "--title=Test PR",
  "--owner=support",
  "--tier=1",
  "--branch=support/test",
  "--blocker=needs clean rebase",
  "--blocker-kind=needs_rebase",
  "--blocker-against-pr=41",
  "--reviewer-note=rebase only",
  "--expected-action=rebase on current main and rerun npm test",
]);
check("add-pr exits 0", r.status === 0, r.stderr);
assertValid("after add-pr");

// 2. set-pr clears structured blocker metadata → validate
r = runCli([
  "set-pr",
  "--number=42",
  "--status=review",
  "--blocker=",
  "--blocker-kind=",
  "--blocker-against-pr=",
  "--reviewer-note=",
  "--expected-action=",
]);
check("set-pr exits 0", r.status === 0, r.stderr);
assertValid("after set-pr");

// 3. close-pr → validate
r = runCli(["close-pr", "--number=42"]);
check("close-pr exits 0", r.status === 0, r.stderr);
assertValid("after close-pr");

// 4. add-blocker → validate
r = runCli(["add-blocker", "--id=test-blocker", "--owner=human", "--summary=needs review"]);
check("add-blocker exits 0", r.status === 0, r.stderr);
assertValid("after add-blocker");

// 5. clear-blocker → validate
r = runCli(["clear-blocker", "--id=test-blocker"]);
check("clear-blocker exits 0", r.status === 0, r.stderr);
assertValid("after clear-blocker");

// 6. add-decision → validate
r = runCli(["add-decision", "--id=D-test", "--question=should we proceed", "--owner-needs=human"]);
check("add-decision exits 0", r.status === 0, r.stderr);
assertValid("after add-decision");

// 7. clear-decision → validate
r = runCli(["clear-decision", "--id=D-test"]);
check("clear-decision exits 0", r.status === 0, r.stderr);
assertValid("after clear-decision");

// 8. final state is back to the seed shape (empty arrays).
const final = JSON.parse(fs.readFileSync(path.join(tmp, "docs", "coordination.json"), "utf8"));
check("final openPullRequests is empty array", Array.isArray(final.openPullRequests) && final.openPullRequests.length === 0);
check("final blockers is empty array", Array.isArray(final.blockers) && final.blockers.length === 0);
check("final decisionsPending is empty array", Array.isArray(final.decisionsPending) && final.decisionsPending.length === 0);

// 9. updatedAt advanced (ISO-8601, parseable).
check(
  "final updatedAt is a valid ISO date",
  typeof final.updatedAt === "string" && !Number.isNaN(Date.parse(final.updatedAt)),
);

if (!allOK) {
  console.error("coordination-state mutate eval: FAILED");
  process.exit(1);
}
console.log("coordination-state mutate eval: OK");
