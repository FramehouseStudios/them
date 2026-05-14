import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "v1_realtime_failover_smoke.mjs");

test("[v1-realtime-failover-smoke] all 4 failover cases pass", () => {
  const r = spawnSync("node", [script], { encoding: "utf8", cwd: repoRoot });
  assert.equal(r.status, 0, `expected exit 0; got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /result: PASS/);
});

test("[v1-realtime-failover-smoke] --json reports pass + zero findings", () => {
  const r = spawnSync("node", [script, "--json"], { encoding: "utf8", cwd: repoRoot });
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.pass, true);
  assert.deepEqual(parsed.findings, []);
});
