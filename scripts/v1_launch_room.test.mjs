import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "v1_launch_room.mjs");

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("[v1-launch-room] --json exposes V1 status and launch lanes", () => {
  const r = run(["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.ok(payload.v1.total > 0);
  assert.ok(payload.v1.done <= payload.v1.total);
  assert.match(payload.claudeNext.request, /Phase 7b talk handler implementation/);
  assert.match(payload.codexNext.action, /Phase 7b|Review Claude PR|human smoke/);
  assert.ok(payload.humanOptions.some((option) => option.command.includes("v1_manual_qa_checklist")));
  assert.ok(Array.isArray(payload.release.blockers));
  assert.match(payload.release.result, /fail=6/);
  assert.ok(payload.release.blockers.some((blocker) => blocker.includes("Config.xcconfig")));
  assert.ok(!payload.humanGated.some((pr) => pr.status === "closed"));
});

test("[v1-launch-room] Claude role prints one deep backend task", () => {
  const r = run(["--role=claude"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^io\.them V1 Launch Room/);
  assert.match(r.stdout, /Claude Launch Options/);
  assert.match(r.stdout, /Do now: Phase 7b talk handler implementation/);
  assert.doesNotMatch(r.stdout, /Human Launch Options/);
});

test("[v1-launch-room] human role prints choices and decision queue", () => {
  const r = run(["--role=human"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Human Launch Options/);
  assert.match(r.stdout, /node scripts\/v1_manual_qa_checklist\.mjs --prompt/);
  assert.match(r.stdout, /Open decisions:/);
  assert.doesNotMatch(r.stdout, /Claude Launch Options/);
});

test("[v1-launch-room] rejects unknown roles", () => {
  const r = run(["--role=wizard"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /invalid --role=wizard/);
});
