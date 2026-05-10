// T23: tests for the craft completeness gate script.
// Spawns the script as a subprocess against the three checked-in
// fixtures and asserts pass/fail behavior.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "check_craft_completeness.mjs");
const FIXTURES = path.join(ROOT, "backend", "fixtures", "craft");

function runScript(args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: ROOT,
    });
    const chunks = { stdout: [], stderr: [] };
    child.stdout.on("data", (b) => chunks.stdout.push(String(b)));
    child.stderr.on("data", (b) => chunks.stderr.push(String(b)));
    child.on("close", (code) => {
      resolve({
        code,
        stdout: chunks.stdout.join(""),
        stderr: chunks.stderr.join(""),
      });
    });
  });
}

test("[T23] passes on report_complete.json (all required major turns detected)", async () => {
  const r = await runScript(["--file", path.join(FIXTURES, "report_complete.json")]);
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}; stderr=${r.stderr}`);
  assert.match(r.stdout, /craft completeness gate: PASS/);
  assert.match(r.stdout, /required=4/);
  assert.match(r.stdout, /detected=4/);
});

test("[T23] passes on report_with_override.json (override satisfies missing turn)", async () => {
  const r = await runScript(["--file", path.join(FIXTURES, "report_with_override.json")]);
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}; stderr=${r.stderr}`);
  assert.match(r.stdout, /craft completeness gate: PASS/);
  assert.match(r.stdout, /overridden=1/);
});

test("[T23] fails on report_with_drift.json with actionable diagnostics", async () => {
  const r = await runScript(["--file", path.join(FIXTURES, "report_with_drift.json")]);
  assert.equal(r.code, 1, `expected exit 1, got ${r.code}; stdout=${r.stdout}`);
  assert.match(r.stderr, /craft completeness gate: FAIL/);
  assert.match(r.stderr, /Missing required major turns:/);
  assert.match(r.stderr, /all-is-lost/);
  assert.match(r.stderr, /POST \/craft\/overrides/);
  assert.match(r.stderr, /drift:/);
});

test("[T23] surfaces a clear error when no fixture or project is supplied", async () => {
  const r = await runScript([]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /pass --file <path> or --project <id>/);
});

test("[T23] surfaces a clear error when --file points at a missing fixture", async () => {
  const r = await runScript(["--file", "/tmp/does-not-exist-craft.json"]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /fixture not found/);
});
