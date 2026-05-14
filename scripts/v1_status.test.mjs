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
  // remaining item that was wrapped: "Current iOS build and
  // `themTests` are green after the next app-visible feature."
  assert.match(
    text,
    /Current iOS build and `themTests` are green after the next app-visible feature\./,
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
