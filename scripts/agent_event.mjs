#!/usr/bin/env node
//
// scripts/agent_event.mjs
//
// Append-only event lane between support agent and Codex.
//
// File: docs/agent-events.jsonl — one JSON object per line. Every
// state transition either agent wants the other to see in
// near-real-time (without a coordination-refresh PR) is emitted
// here. `coordination.json` remains canonical state; this file is
// the live tape of intent.
//
// Commands:
//
//   append --by=support|codex --kind=<event_kind> [--pr=N]
//          [--comment="..."] [--blocker-kind=...] [--blocker-against=N]
//          [--extra='{"key":"value"}']
//
//   tail [--since=<iso-8601>] [--by=...] [--kind=...] [--n=20]
//
//   stats           Counts by kind for the current week's file
//
// Event kinds (canonical):
//   - session_start           agent_next was polled at the start of a session
//   - pr_opened               a new PR was opened
//   - pr_rebased              an existing PR was rebased + force-pushed
//   - pr_merged               a PR was merged
//   - pr_closed               a PR was closed without merging
//   - review_blocker          reviewer flagged a blocker (kind required)
//   - blocker_cleared         a previously-flagged blocker was cleared
//   - coord_refresh           docs/coordination.json was updated
//   - event_protocol_change   event-lane protocol/tooling changed
//   - spec_amend              small spec amendment approved without a new spec PR
//   - spec_opened             a spec PR was opened (multi-PR feature)
//   - spec_approved           spec PR was approved; impl PRs can start
//   - review_ready            PR is ready for Codex review after update/rebase
//   - product_state           daily product-state snapshot
//   - pattern_codified        repeated review pattern was turned into automation
//   - code_review             review pass completed or review intent recorded
//   - design_proposal         short design note/proposal emitted
//   - note                    free-form note (use sparingly; prefer typed kinds)
//
// File rotates weekly. Filename:
//   docs/agent-events-<ISO-year>-W<week>.jsonl
// The plain docs/agent-events.jsonl is a symlink to the current
// week's file (or, if symlinks are unwelcome, append the current
// week's file directly and let the latest week be discovered by
// listing).
//
// Cheap, dependency-free. No I/O against the network.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const eventsDir = path.join(repoRoot, "docs");

const ALLOWED_BY = new Set(["support", "codex", "human"]);
const ALLOWED_KINDS = new Set([
  "session_start",
  "pr_opened",
  "pr_rebased",
  "pr_merged",
  "pr_closed",
  "review_blocker",
  "blocker_cleared",
  "coord_refresh",
  "event_protocol_change",
  "spec_amend",
  "spec_opened",
  "spec_approved",
  "review_ready",
  "product_state",
  "pattern_codified",
  "code_review",
  "design_proposal",
  "note",
]);

function isoWeekKey(date = new Date()) {
  // Calculate ISO 8601 week number.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function eventsFilePath(date = new Date()) {
  return path.join(eventsDir, `agent-events-${isoWeekKey(date)}.jsonl`);
}

function legacyFilePath() {
  // Pointer file for older readers that haven't picked up the weekly
  // rotation yet. Always points at the current week's file via a
  // sibling header line.
  return path.join(eventsDir, "agent-events.jsonl");
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq === -1) {
        args[arg.slice(2)] = true;
      } else {
        args[arg.slice(2, eq)] = arg.slice(eq + 1);
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function fail(msg) {
  console.error(`agent_event: ${msg}`);
  process.exit(1);
}

function appendEvent(args) {
  const by = String(args.by || "");
  if (!ALLOWED_BY.has(by)) fail(`--by must be one of ${[...ALLOWED_BY].join(", ")}`);
  const kind = String(args.kind || "");
  if (!ALLOWED_KINDS.has(kind)) fail(`--kind must be one of ${[...ALLOWED_KINDS].join(", ")}`);

  const event = {
    at: new Date().toISOString(),
    by,
    kind,
  };
  if (args.pr !== undefined) {
    const n = Number(args.pr);
    if (!Number.isInteger(n) || n <= 0) fail("--pr must be a positive integer");
    event.pr = n;
  }
  if (args.comment !== undefined) event.comment = String(args.comment);
  if (args["blocker-kind"] !== undefined) event.blocker_kind = String(args["blocker-kind"]);
  if (args["blocker-against"] !== undefined) {
    const n = Number(args["blocker-against"]);
    if (!Number.isInteger(n) || n <= 0) fail("--blocker-against must be a positive integer");
    event.blocker_against_pr = n;
  }
  if (args.extra !== undefined) {
    try {
      const extra = JSON.parse(String(args.extra));
      if (extra && typeof extra === "object" && !Array.isArray(extra)) {
        Object.assign(event, extra);
      }
    } catch (e) {
      fail(`--extra must be valid JSON object: ${e.message}`);
    }
  }

  // review_blocker kind requires blocker_kind for downstream bucketing.
  if (kind === "review_blocker" && !event.blocker_kind) {
    fail("--blocker-kind is required when --kind=review_blocker");
  }

  const filePath = eventsFilePath();
  ensureFile(filePath);
  fs.appendFileSync(filePath, JSON.stringify(event) + "\n");
  console.log(JSON.stringify(event));
}

function tailEvents(args) {
  // Walk weekly files newest-first until we have enough matching lines.
  const since = args.since ? Date.parse(String(args.since)) : null;
  const limit = args.n ? Math.max(1, Math.min(1000, Number(args.n))) : 20;
  const filterBy = args.by ? String(args.by) : null;
  const filterKind = args.kind ? String(args.kind) : null;

  const entries = fs.readdirSync(eventsDir)
    .filter((f) => /^agent-events-\d{4}-W\d{2}\.jsonl$/.test(f))
    .sort()
    .reverse();

  const collected = [];
  for (const filename of entries) {
    const lines = fs.readFileSync(path.join(eventsDir, filename), "utf8")
      .split("\n").filter(Boolean).reverse();
    for (const line of lines) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (since !== null && Date.parse(event.at) < since) continue;
      if (filterBy && event.by !== filterBy) continue;
      if (filterKind && event.kind !== filterKind) continue;
      collected.push(event);
      if (collected.length >= limit) break;
    }
    if (collected.length >= limit) break;
  }
  // Restore chronological order.
  collected.reverse();
  for (const event of collected) {
    console.log(JSON.stringify(event));
  }
}

function statsEvents() {
  const filePath = eventsFilePath();
  if (!fs.existsSync(filePath)) {
    console.log("(no events this week)");
    return;
  }
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const byKind = new Map();
  const byAgent = new Map();
  for (const line of lines) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    byKind.set(event.kind, (byKind.get(event.kind) || 0) + 1);
    byAgent.set(event.by, (byAgent.get(event.by) || 0) + 1);
  }
  console.log(`agent_event stats — week ${isoWeekKey()} (${lines.length} events)`);
  console.log("");
  console.log("by kind:");
  for (const [k, v] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
  console.log("");
  console.log("by agent:");
  for (const [k, v] of [...byAgent.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "tail";

switch (cmd) {
  case "append":
    appendEvent(args);
    break;
  case "tail":
    tailEvents(args);
    break;
  case "stats":
    statsEvents();
    break;
  default:
    fail(`unknown command: ${cmd}`);
}
