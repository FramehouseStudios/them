import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";
const script = new URL("./v1_launch_room.mjs", import.meta.url).pathname;
function run(args) { return spawnSync(process.execPath, [script, ...args], {encoding: "utf8", env: {...process.env, V1_LAUNCH_DOCTOR_REPORT: ""}}); }
test("[v1-launch-room] compatibility entrypoint delegates to current ownership", () => {
  const result = run(["--json"]);
  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(result.stdout);
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.mode, "codex-only");
  assert.equal(state.productAuthority, "human");
  assert.equal(state.v1, undefined);
  assert.equal(state.releaseLocalConfig, undefined);
  assert.equal(state.launchDoctor.status, "not_requested");
  assert.equal(state.readiness, "UNVERIFIED");
});
test("[v1-launch-room] retired support role cannot launch another lane", () => {
  const result = run(["--role=support"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /THEM — Codex-owned workflow/);
  assert.doesNotMatch(result.stdout, /Support Launch Options|Wait for Codex assignment/);
});
test("[v1-launch-room] unknown role fails explicitly", () => {
  const result = run(["--role=wizard"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /invalid --role=wizard/);
});
