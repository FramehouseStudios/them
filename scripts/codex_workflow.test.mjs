import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

for (const entry of ["agent_next", "print_codex_prompt", "print_support_prompt", "v1_launch_room"]) {
  test(`[codex-workflow] ${entry} cannot dispatch a retired assistant lane`, () => {
    const result = spawnSync(process.execPath, [new URL(`./${entry}.mjs`, import.meta.url).pathname, "--json", "--role=support"], {encoding: "utf8"});
    assert.equal(result.status, 0, result.stderr);
    const state = JSON.parse(result.stdout);
    assert.equal(state.mode, "codex-only");
    assert.equal(state.implementationOwner, "codex");
    assert.equal(state.taskSource, "TASKS.md");
    assert.equal(state.readiness, "UNVERIFIED");
    assert.equal(state.supportNext, undefined);
    assert.equal(state.v1, undefined, "historical checklist percentages are not current product proof");
    assert.ok(state.protections.includes("independent non-author review"));
    assert.ok(state.protections.includes("no direct main push"));
  });
}

test("[codex-workflow] historical rows remain labeled as historical, not reassigned", () => {
  const state = JSON.parse(readFileSync(new URL("../docs/coordination.json", import.meta.url)));
  assert.equal(state.workflow.mode, "codex-only");
  assert.equal(state.workflow.records, "historical");
  assert.ok(state.openPullRequests.some(pr => pr.owner === "support"), "preserve historical authorship/ownership evidence");
});

test("[codex-workflow] malformed stored reports cannot leak content or establish readiness", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "them-workflow-report-"));
  const file = path.join(dir, "report.json");
  for (const content of ["PRIVATE_TEST_VALUE_NOT_A_KEY", JSON.stringify({source: "io.them.v1_launch_doctor", overallStatus: "passed", summary: {passed: 6, total: 5}})]) {
    writeFileSync(file, content);
    const result = spawnSync(process.execPath, [new URL("./v1_launch_room.mjs", import.meta.url).pathname, "--json"], {encoding: "utf8", env: {...process.env, V1_LAUNCH_DOCTOR_REPORT: file}});
    assert.equal(result.status, 0, result.stderr);
    const state = JSON.parse(result.stdout);
    assert.equal(state.launchDoctor.status, "invalid");
    assert.equal(state.readiness, "UNVERIFIED");
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_TEST_VALUE_NOT_A_KEY/);
  }
});

test("[codex-workflow] historical ledger cannot become a new assistant queue", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "them-workflow-history-"));
  mkdirSync(path.join(dir, "scripts"));
  mkdirSync(path.join(dir, "docs"));
  const script = path.join(dir, "scripts", "coordination_state.mjs");
  const file = path.join(dir, "docs", "coordination.json");
  copyFileSync(new URL("./coordination_state.mjs", import.meta.url), script);
  const original = readFileSync(new URL("../docs/coordination.json", import.meta.url), "utf8");
  writeFileSync(file, original);
  const result = spawnSync(process.execPath, [script, "add-pr", "--number=90000", "--title=new assignment", "--owner=support", "--tier=1", "--branch=retired-lane"], {encoding: "utf8"});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /read-only/);
  assert.equal(readFileSync(file, "utf8"), original);
});
