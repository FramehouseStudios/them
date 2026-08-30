// T-agent-events-jsonl-live-lane — tests for the append/tail CLI.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const script = path.resolve(__dirname, "agent_event.mjs");
const docsDir = path.resolve(__dirname, "..", "docs");

// Most tests work against a temp clone of the script so we don't
// pollute the real docs/agent-events-<week>.jsonl. The tempScript
// is identical bytes; only the parent directory differs.
function tempRepoWithScript() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-agent-event-"));
  fs.mkdirSync(path.join(tmp, "scripts"));
  fs.mkdirSync(path.join(tmp, "docs"));
  fs.copyFileSync(script, path.join(tmp, "scripts", "agent_event.mjs"));
  return tmp;
}

function runIn(tmp, args) {
  return spawnSync("node", [path.join(tmp, "scripts", "agent_event.mjs"), ...args], { encoding: "utf8" });
}

test("[agent-event] append + tail round-trip", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, ["append", "--by=support", "--kind=pr_rebased", "--pr=88", "--comment=clean rebase"]);
  assert.equal(r.status, 0, r.stderr);
  const emitted = JSON.parse(r.stdout);
  assert.equal(emitted.by, "support");
  assert.equal(emitted.kind, "pr_rebased");
  assert.equal(emitted.pr, 88);
  assert.equal(emitted.comment, "clean rebase");
  assert.ok(typeof emitted.at === "string" && !Number.isNaN(Date.parse(emitted.at)));

  const t = runIn(tmp, ["tail", "--n=1"]);
  assert.equal(t.status, 0);
  const tailed = JSON.parse(t.stdout.trim());
  assert.deepEqual(tailed, emitted);
});

test("[agent-event] append rejects unknown --by", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, ["append", "--by=other", "--kind=note"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--by must be one of/);
});

test("[agent-event] append rejects unknown --kind", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, ["append", "--by=support", "--kind=lol"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--kind must be one of/);
});

test("[agent-event] append accepts documented coordination event kinds", () => {
  const tmp = tempRepoWithScript();
  const kinds = [
    "event_protocol_change",
    "spec_amend",
    "review_ready",
    "product_state",
    "pattern_codified",
    "code_review",
    "design_proposal",
  ];
  for (const kind of kinds) {
    const r = runIn(tmp, ["append", "--by=codex", `--kind=${kind}`, `--comment=${kind} roundtrip`]);
    assert.equal(r.status, 0, `${kind}: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.kind, kind);
  }
});

test("[agent-event] review_blocker requires blocker_kind", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, ["append", "--by=codex", "--kind=review_blocker", "--pr=92"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /blocker-kind is required/);
});

test("[agent-event] review_blocker accepts blocker-kind + blocker-against", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, [
    "append", "--by=codex", "--kind=review_blocker", "--pr=92",
    "--blocker-kind=needs_rebase", "--blocker-against=103",
  ]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.blocker_kind, "needs_rebase");
  assert.equal(out.blocker_against_pr, 103);
});

test("[agent-event] --extra merges arbitrary JSON fields", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, [
    "append", "--by=support", "--kind=note",
    `--extra={"feature":"block-signal-history","spec_pr":174}`,
  ]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.feature, "block-signal-history");
  assert.equal(out.spec_pr, 174);
});

test("[agent-event] tail --since filters by ISO timestamp", () => {
  const tmp = tempRepoWithScript();
  runIn(tmp, ["append", "--by=support", "--kind=pr_opened", "--pr=1"]);
  // Capture a marker timestamp.
  const marker = new Date(Date.now() + 100).toISOString();
  // Wait a tiny bit so the next event is after `marker`.
  spawnSync("sleep", ["0.2"]);
  runIn(tmp, ["append", "--by=support", "--kind=pr_merged", "--pr=2"]);
  const t = runIn(tmp, ["tail", `--since=${marker}`, "--n=10"]);
  assert.equal(t.status, 0);
  const lines = t.stdout.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  // Should NOT include pr=1 (before marker); should include pr=2.
  assert.ok(lines.every((e) => e.pr !== 1), `pr=1 should be filtered, got: ${JSON.stringify(lines)}`);
  assert.ok(lines.some((e) => e.pr === 2), `pr=2 should be included`);
});

test("[agent-event] tail --by filters by agent", () => {
  const tmp = tempRepoWithScript();
  runIn(tmp, ["append", "--by=support", "--kind=pr_opened", "--pr=10"]);
  runIn(tmp, ["append", "--by=codex", "--kind=pr_merged", "--pr=10"]);
  const t = runIn(tmp, ["tail", "--by=codex", "--n=5"]);
  assert.equal(t.status, 0);
  const lines = t.stdout.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(lines.every((e) => e.by === "codex"));
});

test("[agent-event] tail --kind filters by kind", () => {
  const tmp = tempRepoWithScript();
  runIn(tmp, ["append", "--by=support", "--kind=pr_opened", "--pr=11"]);
  runIn(tmp, ["append", "--by=support", "--kind=pr_merged", "--pr=11"]);
  const t = runIn(tmp, ["tail", "--kind=pr_merged", "--n=5"]);
  assert.equal(t.status, 0);
  const lines = t.stdout.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(lines.every((e) => e.kind === "pr_merged"));
});

test("[agent-event] stats prints counts when events exist", () => {
  const tmp = tempRepoWithScript();
  runIn(tmp, ["append", "--by=support", "--kind=pr_opened", "--pr=1"]);
  runIn(tmp, ["append", "--by=support", "--kind=pr_merged", "--pr=1"]);
  runIn(tmp, ["append", "--by=codex", "--kind=pr_merged", "--pr=2"]);
  const r = runIn(tmp, ["stats"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /by kind:/);
  assert.match(r.stdout, /by agent:/);
  assert.match(r.stdout, /pr_merged/);
});

test("[agent-event] stats handles empty file gracefully", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, ["stats"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no events this week/);
});

test("[agent-event] tail handles empty events directory gracefully", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, ["tail"]);
  assert.equal(r.status, 0);
  // Output should be empty (no events yet).
  assert.equal(r.stdout.trim(), "");
});

test("[agent-event] unknown subcommand exits 1", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, ["definitely-not-a-real-command"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown command/);
});

test("[agent-event] --pr rejects non-integer", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, ["append", "--by=support", "--kind=note", "--pr=not-a-number"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pr must be a positive integer/);
});

test("[agent-event] --extra rejects invalid JSON", () => {
  const tmp = tempRepoWithScript();
  const r = runIn(tmp, ["append", "--by=support", "--kind=note", "--extra=not-json"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /extra must be valid JSON object/);
});

// Smoke against the real repo dir: just confirm tail doesn't crash
// when no week file exists yet. (The real docs/ dir might also have
// older non-jsonl files; the regex filter must exclude them.)
test("[agent-event] tail in real repo dir doesn't crash on non-jsonl siblings", () => {
  const r = spawnSync("node", [script, "tail", "--n=1"], { encoding: "utf8", cwd: path.resolve(__dirname, "..") });
  assert.equal(r.status, 0, r.stderr);
});
