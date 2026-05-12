import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const script = path.resolve(__dirname, "agent_next.mjs");

function fixturePath() {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-next-"));
  const file = path.join(dir, "coordination.json");
  writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-05-12T08:00:00.000Z",
    updatedBy: "test",
    openPullRequests: [
      { number: 42, title: "Merged old work", owner: "claude", tier: 1, status: "merged", branch: "x", blocker: null },
      { number: 148, title: "Routes manifest", owner: "claude", tier: 1, status: "blocked", branch: "a", blocker: "rebase and fix scope" },
      { number: 87, title: "Fountain import", owner: "claude", tier: 1, status: "blocked", branch: "b", blocker: "add 413 route test" },
      { number: 200, title: "Tiny helper", owner: "claude", tier: 1, status: "review", branch: "c", blocker: null },
      { number: 201, title: "Memory export", owner: "claude", tier: 3, status: "needs-human", branch: "d", blocker: "human privacy approval" },
      { number: 300, title: "Codex app work", owner: "codex", tier: 1, status: "in-progress", branch: "e", blocker: null },
    ],
    blockers: [],
    decisionsPending: [],
    endpointsAwaitingIosConsumer: [
      { pr: 199, endpoint: "GET /ops/health-summary", consumer: "Build diagnostics rail" },
    ],
  }, null, 2));
  return file;
}

test("[agent-next] text output prioritizes Claude blockers", () => {
  const r = spawnSync("node", [script, "--role=claude", "--limit=2", `--state=${fixturePath()}`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Claude Next/);
  assert.ok(r.stdout.indexOf("#148") < r.stdout.indexOf("#87"), r.stdout);
  assert.doesNotMatch(r.stdout, /#200 Tiny helper/);
});

test("[agent-next] json output separates Codex review candidates and iOS work", () => {
  const r = spawnSync("node", [script, "--format=json", "--limit=3", `--state=${fixturePath()}`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.throughput.blockedClaudeCount, 2);
  assert.equal(out.claude[0].pr, 148);
  assert.equal(out.codex[0].pr, 200);
  assert.equal(out.codex[1].reason, "finish-codex-owned");
  assert.equal(out.codex[2].reason, "ready-for-ios");
  assert.equal(out.humanGated[0].pr, 201);
});
