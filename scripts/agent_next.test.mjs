import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
      { number: 301, title: "Blocked 301", owner: "claude", tier: 1, status: "blocked", branch: "b301", blocker: "rebase" },
      { number: 302, title: "Blocked 302", owner: "claude", tier: 1, status: "blocked", branch: "b302", blocker: "rebase" },
      { number: 303, title: "Blocked 303", owner: "claude", tier: 1, status: "blocked", branch: "b303", blocker: "rebase" },
      { number: 304, title: "Blocked 304", owner: "claude", tier: 1, status: "blocked", branch: "b304", blocker: "rebase" },
      { number: 305, title: "Blocked 305", owner: "claude", tier: 1, status: "blocked", branch: "b305", blocker: "rebase" },
      { number: 306, title: "Blocked 306", owner: "claude", tier: 1, status: "blocked", branch: "b306", blocker: "rebase" },
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

function humanGatedOnlyFixturePath() {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-next-human-gated-"));
  const file = path.join(dir, "coordination.json");
  writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-05-14T17:43:57.933Z",
    updatedBy: "test",
    openPullRequests: [
      { number: 212, title: "Auth routes", owner: "claude", tier: 3, status: "blocked", branch: "auth", blocker: "human auth clearance" },
      { number: 94, title: "Memory export", owner: "claude", tier: 3, status: "needs-human", branch: "export", blocker: "human privacy approval" },
      { number: 99, title: "Memory delete", owner: "claude", tier: 3, status: "needs-human", branch: "delete", blocker: "human privacy approval" },
    ],
    blockers: [],
    decisionsPending: [],
    endpointsAwaitingIosConsumer: [],
  }, null, 2));
  return file;
}

function claudeInboxPath() {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-next-inbox-"));
  const file = path.join(dir, "claude-inbox.md");
  writeFileSync(file, [
    "# Claude Inbox",
    "",
    "## Backend Work Codex Actually Wants Next",
    "",
    "| Priority | Request | Why it matters | Expected shape |",
    "| --- | --- | --- | --- |",
    "| 1 | Phase 5b.4 realtime call extraction | Clears the last `/realtime/*` route before talk decomposition. | Extract `POST /realtime/call` with byte-identical behavior and tests. |",
    "| 2 | Phase 6 memories routes | Moves memory reads after realtime is stable. | Follow the accepted design note. |",
    "",
    "## Decomposition Rules",
    "",
  ].join("\n"));
  return file;
}

function runGit(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
}

function staleRepoPath() {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-next-stale-repo-"));
  const docs = path.join(dir, "docs");
  mkdirSync(docs);
  writeFileSync(path.join(docs, "coordination.json"), JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-05-14T20:00:00.000Z",
    updatedBy: "test",
    openPullRequests: [],
    blockers: [],
    decisionsPending: [],
    endpointsAwaitingIosConsumer: [],
  }, null, 2));
  writeFileSync(path.join(docs, "claude-inbox.md"), [
    "# Claude Inbox",
    "",
    "## Backend Work Codex Actually Wants Next",
    "",
    "| Priority | Request | Why it matters | Expected shape |",
    "| --- | --- | --- | --- |",
    "| 1 | Phase 7a talk pipeline guards/state extraction | Talk is the critical path. | Extract talk guards. |",
    "",
  ].join("\n"));
  runGit(dir, ["init"]);
  runGit(dir, ["config", "user.email", "agent-next-test@example.test"]);
  runGit(dir, ["config", "user.name", "Agent Next Test"]);
  runGit(dir, ["add", "docs"]);
  runGit(dir, ["commit", "-m", "base"]);
  const base = runGit(dir, ["rev-parse", "HEAD"]);
  writeFileSync(path.join(docs, "coordination.json"), JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-05-14T20:05:00.000Z",
    updatedBy: "test",
    openPullRequests: [],
    blockers: [],
    decisionsPending: [],
    endpointsAwaitingIosConsumer: [],
  }, null, 2));
  runGit(dir, ["add", "docs/coordination.json"]);
  runGit(dir, ["commit", "-m", "origin-main-ahead"]);
  const ahead = runGit(dir, ["rev-parse", "HEAD"]);
  runGit(dir, ["update-ref", "refs/remotes/origin/main", ahead]);
  runGit(dir, ["reset", "--hard", base]);
  return dir;
}

test("[agent-next] text output prioritizes Claude blockers", () => {
  const r = spawnSync("node", [script, "--role=claude", "--limit=2", "--no-events", `--state=${fixturePath()}`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Claude Next/);
  assert.ok(r.stdout.indexOf("#148") < r.stdout.indexOf("#87"), r.stdout);
  assert.doesNotMatch(r.stdout, /#200 Tiny helper/);
  assert.match(r.stdout, /WIP limit per support agent: 6 \(blocker-clearing\)/);
});

test("[agent-next] json output separates Codex review candidates and iOS work", () => {
  const r = spawnSync("node", [script, "--format=json", "--limit=3", "--no-events", `--state=${fixturePath()}`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.throughput.blockedClaudeCount, 8);
  assert.equal(out.throughput.wipLimit, 6);
  assert.equal(out.throughput.wipMode, "blocker-clearing");
  assert.equal(out.claude[0].pr, 148);
  assert.equal(out.codex[0].pr, 200);
  assert.equal(out.codex[1].reason, "finish-codex-owned");
  assert.equal(out.codex[2].reason, "ready-for-ios");
  assert.equal(out.humanGated[0].pr, 201);
  assert.deepEqual(out.recentEvents, []);
});

test("[agent-next] surfaces recent agent events and supports --events-since", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-next-events-"));
  const docs = path.join(dir, "docs");
  mkdirSync(docs);
  writeFileSync(path.join(docs, "agent-events-2026-W20.jsonl"), [
    JSON.stringify({ at: "2026-05-12T08:00:00.000Z", by: "claude", kind: "pr_rebased", pr: 88, comment: "old" }),
    JSON.stringify({ at: "2026-05-12T09:00:00.000Z", by: "codex", kind: "review_blocker", pr: 92, blocker_kind: "needs_test_fix" }),
    JSON.stringify({ at: "2026-05-12T10:00:00.000Z", by: "codex", kind: "pr_merged", pr: 88, comment: "merged" }),
    "",
  ].join("\n"));
  const r = spawnSync("node", [
    script,
    "--role=codex",
    "--limit=1",
    "--events-limit=5",
    "--events-since=2026-05-12T08:30:00.000Z",
    `--events-dir=${docs}`,
    `--state=${fixturePath()}`,
  ], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /old/);
  assert.match(r.stdout, /review_blocker/);
  assert.match(r.stdout, /needs_test_fix/);
  assert.match(r.stdout, /pr_merged/);
});

test("[agent-next] human-gated PRs do not consume Claude WIP and inbox backlog becomes next action", () => {
  const r = spawnSync("node", [
    script,
    "--role=claude",
    "--limit=2",
    "--no-events",
    `--state=${humanGatedOnlyFixturePath()}`,
    `--claude-inbox=${claudeInboxPath()}`,
  ], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Active PRs: claude 0, codex 0, human 0/);
  assert.match(r.stdout, /Human-gated PRs are parked/);
  assert.match(r.stdout, /Claude Next 2/);
  assert.match(r.stdout, /Phase 5b\.4 realtime call extraction/);
  assert.match(r.stdout, /Expected: Extract POST \/realtime\/call with byte-identical behavior and tests\./);
  assert.doesNotMatch(r.stdout, /Claude should clear existing blockers/);
});

test("[agent-next] warns when the checkout is behind origin/main", () => {
  const repo = staleRepoPath();
  const r = spawnSync("node", [
    script,
    "--role=claude",
    "--limit=1",
    "--no-events",
  ], {
    encoding: "utf8",
    env: { ...process.env, AGENT_NEXT_REPO_ROOT: repo },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Checkout Warning/);
  assert.match(r.stdout, /behind origin\/main/);
  assert.match(r.stdout, /Phase 7a talk pipeline guards\/state extraction/);
});
