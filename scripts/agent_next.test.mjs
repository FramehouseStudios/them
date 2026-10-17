import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";
const script = new URL("./agent_next.mjs", import.meta.url).pathname;
function run(args) { return spawnSync(process.execPath, [script, ...args], {encoding: "utf8"}); }
for (const role of ["all", "codex", "support", "human"]) {
  test("[agent-next] " + role + " resolves to Codex ownership, not an obsolete queue", () => {
    const result = run(["--role=" + role, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const state = JSON.parse(result.stdout);
    assert.equal(state.implementationOwner, "codex");
    assert.equal(state.taskSource, "TASKS.md");
    assert.equal(state.readiness, "UNVERIFIED");
    assert.equal(state.supportNext, undefined);
  });
}
test("[agent-next] human authority and required review are preserved", () => {
  const result = run([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /human retains product and approval authority/);
  assert.match(result.stdout, /independent non-author review/);
  assert.match(result.stdout, /no direct main push/);
  assert.doesNotMatch(result.stdout, /Support Next|wait for the support lane|WIP limit/);
});
test("[agent-next] rejects invalid roles and historical queue overrides", () => {
  for (const arg of ["--role=wizard", "--state=/tmp/stale-coordination.json"]) {
    const result = run([arg]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /invalid|retired/);
  }
});
