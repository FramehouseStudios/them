// T-v1-status-reporter — regression tests for the parser.
//
// History: PR #243 review surfaced that the original parser
// truncated wrapped continuation lines like:
//
//   - [x] Character mentions, traits, archetypes, accepted twists, and block
//         history have backend/iOS surfaces.
//
// The first version stopped at the newline and silently dropped
// the second half. These tests pin the fixed behavior using a
// synthetic fixture so a future regression can't sneak through.
//
// Approach: write a temp docs/v1-definition.md-shaped fixture,
// invoke the script with an env var redirecting the source path
// — except the script reads a hardcoded path. So we exercise the
// script via stdin / spawn against the real doc and assert on
// items whose text was previously truncated.

import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "v1_status.mjs");

function runJson() {
  const r = spawnSync("node", [script, "--json"], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  assert.equal(r.status, 0, `v1_status exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

test("[v1-status] runs to completion against the real v1-definition.md", () => {
  const out = runJson();
  assert.ok(out.overall.total > 0, "should find at least one checklist item");
  assert.ok(Array.isArray(out.pillars));
  assert.ok(out.pillars.length > 0);
});

test("[v1-status] wrapped checkbox text is joined into a single item", () => {
  // docs/v1-definition.md contains at least one multi-line item:
  //   - [x] Character mentions, traits, archetypes, accepted twists, and block
  //         history have backend/iOS surfaces.
  // Before the fix, the parser only captured the first line so
  // the second half ("history have backend/iOS surfaces.") was
  // dropped silently. After the fix the full text appears as a
  // single item.
  const out = runJson();
  const allItems = out.pillars.flatMap((p) => [...p.remaining, ...Array(p.done).fill("__DONE__")]);
  // The done items are summarized as counts in this script's JSON,
  // not by text. Pull text out of the markdown view instead.
  const r = spawnSync("node", [script], { encoding: "utf8", cwd: repoRoot });
  const text = r.stdout;
  // The "Character mentions" line is done, so it won't be in the
  // remaining list. Look for any item that ends with a continuation-
  // line's tail to prove the parser captured it.
  // The clearest evidence: "iOS Release Readiness" still has a
  // remaining item that is wrapped across two lines.
  assert.match(
    text,
    /Human signs off on the V1 manual smoke before external review and the TestFlight handoff can proceed\./,
    "wrapped continuation line must be joined into the item text",
  );
});

test("[v1-status] checklist counts exclude grandfathered headings", () => {
  // "V1 Promise" and "PR Rule" are H2 sections that should NOT
  // contribute to the pillar list.
  const out = runJson();
  for (const p of out.pillars) {
    assert.ok(!/v1 promise|pr rule/i.test(p.pillar),
      `${p.pillar} should have been skipped`);
  }
});

test("[v1-status] every remaining item is a non-empty single-line string", () => {
  const out = runJson();
  for (const p of out.pillars) {
    for (const r of p.remaining) {
      assert.equal(typeof r, "string");
      assert.ok(r.length > 0);
      assert.ok(!r.includes("\n"), `remaining item must be single-line, got: ${JSON.stringify(r)}`);
    }
  }
});

test("[v1-status] --json output has the canonical envelope", () => {
  const out = runJson();
  assert.ok("overall" in out);
  assert.ok("pillars" in out);
  assert.ok("sourcePath" in out);
  assert.equal(typeof out.overall.done, "number");
  assert.equal(typeof out.overall.total, "number");
  assert.equal(typeof out.overall.pct, "number");
});

// ---------- --diff flag ----------

test("[v1-status] --diff=HEAD against itself shows no changes", () => {
  const r = spawnSync("node", [script, "--json", "--diff=HEAD"], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  assert.equal(r.status, 0, `expected exit 0; got ${r.status}\n${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.ok(out.diff, "expected diff block");
  assert.equal(out.diff.ref, "HEAD");
  assert.deepEqual(out.diff.flippedDone, []);
  assert.deepEqual(out.diff.flippedUndone, []);
  assert.deepEqual(out.diff.movedPillar, []);
  assert.deepEqual(out.diff.added, []);
  assert.deepEqual(out.diff.removed, []);
});

test("[v1-status] --diff with invalid ref exits non-zero with descriptive error", () => {
  const r = spawnSync("node", [script, "--diff=__nonexistent_ref_xyz"], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  assert.notEqual(r.status, 0, "expected non-zero exit on bad ref");
  assert.match(r.stderr, /diff=__nonexistent_ref_xyz/);
});

test("[v1-status] text-mode --diff includes Diff vs <ref> header", () => {
  const r = spawnSync("node", [script, "--diff=HEAD"], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Diff vs HEAD:/);
});

// ---------- --md-comment flag ----------

test("[v1-status] --md-comment emits PR-comment-shaped output", () => {
  const r = spawnSync("node", [script, "--md-comment"], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  assert.equal(r.status, 0, `exit ${r.status}: ${r.stderr}`);
  // Canonical heading + headline + markdown table + details block.
  assert.match(r.stdout, /^## V1 status$/m);
  assert.match(r.stdout, /\*\*Overall:\*\* \d+\/\d+ \(\d+%\)/);
  assert.match(r.stdout, /^\| Pillar \| Done \| Total \| % \| Next remaining \|$/m);
  // Details block uses HTML <details> / <summary>.
  assert.match(r.stdout, /<details>/);
  assert.match(r.stdout, /<summary>Remaining work by pillar<\/summary>/);
  assert.match(r.stdout, /<\/details>/);
  // Sub footer with regenerate command.
  assert.match(r.stdout, /node scripts\/v1_status\.mjs --md-comment/);
});

test("[v1-status] --md-comment + non-matching --pillar filter omits details block", () => {
  const r = spawnSync("node", [script, "--md-comment", "--pillar=__nonexistent__"], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  assert.equal(r.status, 0);
  assert.ok(!r.stdout.includes("<details>"));
});
