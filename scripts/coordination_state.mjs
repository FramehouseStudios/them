#!/usr/bin/env node
//
// scripts/coordination_state.mjs
//
// Small, dependency-free CLI for reading and updating
// `docs/coordination.json` — the fast-path coordination state shared
// by Claude, Codex, and the human. Replaces re-reading the long
// ledgers when an agent just needs to know "what's open, what's
// blocked, what's waiting on a decision".
//
// Commands:
//
//   read [--format=json|text]       Print the state (default: text).
//   open-prs                        Print just the open PRs table.
//   blockers                        Print just the active blockers.
//   decisions                       Print just the pending decisions.
//
//   add-pr --number=N --title=T --owner=claude|codex --tier=1|2|3 \
//          --branch=B [--status=review|in-progress] [--blocker=TEXT]
//   close-pr --number=N
//   set-pr --number=N [--status=...] [--tier=...] [--blocker=...]
//
//   add-blocker --id=ID --owner=human|claude|codex --summary=TEXT
//   clear-blocker --id=ID
//
//   add-decision --id=ID --question=TEXT [--owner-needs=human|codex|claude]
//   clear-decision --id=ID
//
// Mutating commands stamp `updatedAt` (UTC ISO) and `updatedBy`.
// `updatedBy` defaults to the value of the `COORD_AGENT` env var, or
// "unknown" if unset. Each agent should export it once per session:
//
//   export COORD_AGENT=claude
//   export COORD_AGENT=codex
//
// The file is small enough that every mutation rewrites it; no lock
// is required because each PR-row update lands on a separate branch.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const FILE = path.join(repoRoot, "docs/coordination.json");

function readState() {
  const raw = fs.readFileSync(FILE, "utf8");
  return JSON.parse(raw);
}

function writeState(state, agent) {
  state.updatedAt = new Date().toISOString();
  state.updatedBy = agent || process.env.COORD_AGENT || "unknown";
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2) + "\n");
}

function parseArgs(argv) {
  const args = { _: [] };
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const [k, ...rest] = arg.slice(2).split("=");
      args[k] = rest.length ? rest.join("=") : true;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function fail(msg) {
  console.error(`coordination_state: ${msg}`);
  process.exit(1);
}

function textFormat(state) {
  const lines = [];
  lines.push(`updatedAt: ${state.updatedAt}  by ${state.updatedBy}`);
  lines.push("");
  lines.push(`Open PRs (${state.openPullRequests.length}):`);
  for (const pr of state.openPullRequests) {
    const blocker = pr.blocker ? `  blocker: ${pr.blocker}` : "";
    lines.push(`  #${pr.number} [${pr.status}] tier-${pr.tier} ${pr.owner}: ${pr.title}${blocker}`);
  }
  lines.push("");
  lines.push(`Blockers (${state.blockers.length}):`);
  for (const b of state.blockers) {
    lines.push(`  ${b.id} (${b.owner}): ${b.summary}`);
  }
  lines.push("");
  lines.push(`Decisions pending (${state.decisionsPending.length}):`);
  for (const d of state.decisionsPending) {
    const needs = d.ownerNeeds ? `  needs: ${d.ownerNeeds}` : "";
    lines.push(`  ${d.id}: ${d.question}${needs}`);
  }
  if (state.endpointsAwaitingIosConsumer && state.endpointsAwaitingIosConsumer.length) {
    lines.push("");
    lines.push(`Endpoints awaiting iOS consumer (${state.endpointsAwaitingIosConsumer.length}):`);
    for (const e of state.endpointsAwaitingIosConsumer) {
      lines.push(`  ${e.endpoint}  (PR #${e.pr}) → ${e.consumer}`);
    }
  }
  return lines.join("\n");
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "read";

switch (cmd) {
  case "read": {
    const state = readState();
    if (args.format === "json") {
      console.log(JSON.stringify(state, null, 2));
    } else {
      console.log(textFormat(state));
    }
    break;
  }
  case "open-prs": {
    const state = readState();
    console.log(JSON.stringify(state.openPullRequests, null, 2));
    break;
  }
  case "blockers": {
    const state = readState();
    console.log(JSON.stringify(state.blockers, null, 2));
    break;
  }
  case "decisions": {
    const state = readState();
    console.log(JSON.stringify(state.decisionsPending, null, 2));
    break;
  }
  case "add-pr": {
    const state = readState();
    const number = Number(args.number);
    if (!Number.isInteger(number)) fail("--number=N required");
    if (state.openPullRequests.find((p) => p.number === number)) {
      fail(`PR #${number} already in coordination state — use set-pr to update`);
    }
    state.openPullRequests.push({
      number,
      title: String(args.title || ""),
      owner: String(args.owner || ""),
      tier: Number(args.tier) || 1,
      status: String(args.status || "review"),
      branch: String(args.branch || ""),
      blocker: args.blocker ? String(args.blocker) : null,
    });
    writeState(state);
    console.log(`added #${number}`);
    break;
  }
  case "close-pr": {
    const state = readState();
    const number = Number(args.number);
    if (!Number.isInteger(number)) fail("--number=N required");
    const before = state.openPullRequests.length;
    state.openPullRequests = state.openPullRequests.filter((p) => p.number !== number);
    if (state.openPullRequests.length === before) {
      console.log(`PR #${number} not in coordination state — nothing to close`);
    } else {
      writeState(state);
      console.log(`closed #${number}`);
    }
    break;
  }
  case "set-pr": {
    const state = readState();
    const number = Number(args.number);
    if (!Number.isInteger(number)) fail("--number=N required");
    const pr = state.openPullRequests.find((p) => p.number === number);
    if (!pr) fail(`PR #${number} not in coordination state`);
    if (args.status) pr.status = String(args.status);
    if (args.tier) pr.tier = Number(args.tier);
    if (args.blocker !== undefined) {
      pr.blocker = args.blocker === false || args.blocker === "" ? null : String(args.blocker);
    }
    writeState(state);
    console.log(`updated #${number}`);
    break;
  }
  case "add-blocker": {
    const state = readState();
    const id = String(args.id || "");
    if (!id) fail("--id=ID required");
    if (state.blockers.find((b) => b.id === id)) fail(`blocker ${id} already present`);
    state.blockers.push({
      id,
      owner: String(args.owner || "unknown"),
      summary: String(args.summary || ""),
      since: new Date().toISOString().slice(0, 10),
    });
    writeState(state);
    console.log(`added blocker ${id}`);
    break;
  }
  case "clear-blocker": {
    const state = readState();
    const id = String(args.id || "");
    if (!id) fail("--id=ID required");
    state.blockers = state.blockers.filter((b) => b.id !== id);
    writeState(state);
    console.log(`cleared blocker ${id}`);
    break;
  }
  case "add-decision": {
    const state = readState();
    const id = String(args.id || "");
    if (!id) fail("--id=ID required");
    if (state.decisionsPending.find((d) => d.id === id)) fail(`decision ${id} already pending`);
    state.decisionsPending.push({
      id,
      question: String(args.question || ""),
      ownerNeeds: args["owner-needs"] ? String(args["owner-needs"]) : "human",
      since: new Date().toISOString().slice(0, 10),
    });
    writeState(state);
    console.log(`added decision ${id}`);
    break;
  }
  case "clear-decision": {
    const state = readState();
    const id = String(args.id || "");
    if (!id) fail("--id=ID required");
    state.decisionsPending = state.decisionsPending.filter((d) => d.id !== id);
    writeState(state);
    console.log(`cleared decision ${id}`);
    break;
  }
  default:
    fail(`unknown command: ${cmd}`);
}
