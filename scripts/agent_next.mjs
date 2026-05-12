#!/usr/bin/env node
//
// scripts/agent_next.mjs
//
// Prints the next high-leverage actions for Codex and Claude from
// docs/coordination.json, plus the recent live event tape from
// docs/agent-events-*.jsonl. This is intentionally small and deterministic:
// no GitHub API calls, no network, no dependencies. The coordination file
// remains the durable source of truth; the event tape answers "what just
// happened?"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const DEFAULT_STATE = path.join(repoRoot, "docs/coordination.json");
const DEFAULT_EVENTS_DIR = path.join(repoRoot, "docs");

const DONE_STATUSES = new Set(["merged", "closed"]);
const HUMAN_STATUSES = new Set(["needs-human", "policy-gated"]);
const BLOCKED_STATUSES = new Set(["blocked"]);
const REVIEW_STATUSES = new Set(["review", "ready", "ready-for-review"]);

const CLAUDE_PRIORITY = new Map([
  [163, 100],
  [164, 98],
  [161, 96],
  [166, 94],
  [159, 92],
  [171, 90],
  [148, 100],
  [142, 96],
  [133, 92],
  [87, 88],
  [90, 86],
  [88, 84],
  [92, 82],
  [97, 80],
  [100, 78],
  [104, 74],
  [105, 72],
  [107, 70],
  [110, 68],
  [111, 66],
  [112, 64],
  [115, 62],
  [117, 60],
  [124, 58],
  [127, 56],
]);

function parseArgs(argv) {
  const args = {
    role: "all",
    limit: 5,
    format: "text",
    state: DEFAULT_STATE,
    events: true,
    eventsDir: DEFAULT_EVENTS_DIR,
    eventsLimit: 5,
    eventsSince: null,
  };
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    const value = rest.length ? rest.join("=") : "true";
    if (key === "role") args.role = value;
    else if (key === "limit") args.limit = Math.max(1, Number(value) || 5);
    else if (key === "format") args.format = value;
    else if (key === "json") args.format = "json";
    else if (key === "state") args.state = path.resolve(value);
    else if (key === "no-events") args.events = false;
    else if (key === "events-dir") args.eventsDir = path.resolve(value);
    else if (key === "events-limit") args.eventsLimit = Math.max(0, Number(value) || 0);
    else if (key === "events-since") args.eventsSince = value;
  }
  return args;
}

function readState(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readRecentEvents({ eventsDir, eventsLimit, eventsSince }) {
  if (eventsLimit <= 0 || !fs.existsSync(eventsDir)) return [];
  const sinceMs = eventsSince ? Date.parse(eventsSince) : null;
  const files = fs.readdirSync(eventsDir)
    .filter((f) => /^agent-events-\d{4}-W\d{2}\.jsonl$/.test(f))
    .sort()
    .reverse();
  const events = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(eventsDir, file), "utf8")
      .split("\n")
      .filter(Boolean)
      .reverse();
    for (const line of lines) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      const atMs = Date.parse(event.at);
      if (sinceMs !== null && (Number.isNaN(atMs) || atMs < sinceMs)) continue;
      events.push(event);
      if (events.length >= eventsLimit) break;
    }
    if (events.length >= eventsLimit) break;
  }
  return events.reverse();
}

function isDone(pr) {
  return DONE_STATUSES.has(pr.status);
}

function isHumanGated(pr) {
  return pr.tier === 3 || HUMAN_STATUSES.has(pr.status) || /human/i.test(pr.blocker || "");
}

function isBlocked(pr) {
  return BLOCKED_STATUSES.has(pr.status) || Boolean(pr.blocker);
}

function isReviewable(pr) {
  return pr.owner === "claude"
    && !isDone(pr)
    && !isBlocked(pr)
    && !isHumanGated(pr)
    && REVIEW_STATUSES.has(pr.status);
}

function scoreClaude(pr) {
  const pinned = CLAUDE_PRIORITY.get(pr.number);
  if (pinned) return pinned;
  let score = 10;
  if (isBlocked(pr)) score += 30;
  if (pr.tier === 1) score += 8;
  if (/rebase|DIRTY|conflict/i.test(pr.blocker || "")) score += 4;
  if (/access-control|privacy|human/i.test(pr.blocker || "")) score -= 12;
  return score;
}

function summarize(pr) {
  const blocker = pr.blocker ? ` — ${pr.blocker}` : "";
  return `#${pr.number} ${pr.title} [${pr.status}, tier-${pr.tier}]${blocker}`;
}

function eventSummary(event) {
  const pr = event.pr ? `#${event.pr} ` : "";
  const note = event.comment ? ` — ${event.comment}` : "";
  const blocker = event.blocker_kind ? ` (${event.blocker_kind})` : "";
  return `${event.at} ${event.by}:${event.kind} ${pr}${blocker}${note}`.trim();
}

function buildNext(state, { limit, recentEvents = [] }) {
  const prs = state.openPullRequests || [];
  const active = prs.filter((pr) => !isDone(pr));
  const activeByOwner = {
    claude: active.filter((pr) => pr.owner === "claude").length,
    codex: active.filter((pr) => pr.owner === "codex").length,
    human: active.filter((pr) => pr.owner === "human").length,
  };
  const blockedClaude = active.filter((pr) => pr.owner === "claude" && isBlocked(pr) && !isHumanGated(pr));
  const humanGated = active.filter(isHumanGated);
  const reviewableClaude = active.filter(isReviewable);
  const codexOwn = active.filter((pr) => pr.owner === "codex" && !isBlocked(pr));
  const claudeBlockedRatio = activeByOwner.claude === 0
    ? 0
    : blockedClaude.length / activeByOwner.claude;

  const claude = blockedClaude
    .sort((a, b) => scoreClaude(b) - scoreClaude(a) || a.number - b.number)
    .slice(0, limit)
    .map((pr) => ({
      pr: pr.number,
      title: pr.title,
      reason: "clear-blocker",
      action: pr.blocker || "Clear blocker and request Codex review.",
    }));

  const codex = [];
  for (const pr of reviewableClaude.slice(0, limit)) {
    codex.push({
      pr: pr.number,
      title: pr.title,
      reason: "review-merge-candidate",
      action: "Review diff, verify checks, label/merge if clean.",
    });
  }
  for (const pr of codexOwn.slice(0, Math.max(0, limit - codex.length))) {
    codex.push({
      pr: pr.number,
      title: pr.title,
      reason: "finish-codex-owned",
      action: "Finish or land Codex-owned work before starting another branch.",
    });
  }
  for (const endpoint of state.endpointsAwaitingIosConsumer || []) {
    if (codex.length >= limit) break;
    codex.push({
      pr: endpoint.pr,
      title: endpoint.endpoint,
      reason: "ready-for-ios",
      action: endpoint.consumer || "Build the iOS consumer.",
    });
  }
  if (codex.length === 0 && blockedClaude.length > 0) {
    const top = blockedClaude.sort((a, b) => scoreClaude(b) - scoreClaude(a) || a.number - b.number)[0];
    codex.push({
      pr: top.number,
      title: top.title,
      reason: "supervise-blocker",
      action: "No clean Codex review candidates in coordination.json; press this Claude blocker or wait for Claude to update the queue.",
    });
  }

  const wipLimit = claudeBlockedRatio >= 0.8 ? 6 : 3;
  return {
    updatedAt: state.updatedAt,
    throughput: {
      wipLimit,
      wipMode: wipLimit === 6 ? "blocker-clearing" : "normal",
      activeByOwner,
      claudeOverLimit: activeByOwner.claude > wipLimit,
      blockedClaudeCount: blockedClaude.length,
      claudeBlockedRatio,
      humanGatedCount: humanGated.length,
      reviewableClaudeCount: reviewableClaude.length,
      recommendation: activeByOwner.claude > wipLimit || blockedClaude.length > 0
        ? "Claude should clear existing blockers before opening net-new backend work."
        : "Claude has room for one scoped backend/support task.",
    },
    claude,
    codex,
    humanGated: humanGated.slice(0, limit).map((pr) => ({
      pr: pr.number,
      title: pr.title,
      action: pr.blocker || "Needs explicit human approval.",
    })),
    recentEvents,
  };
}

function formatText(next, role) {
  const lines = [];
  lines.push(`agent_next: ${next.updatedAt}`);
  lines.push("");
  lines.push("Throughput");
  lines.push(`- WIP limit per support agent: ${next.throughput.wipLimit} (${next.throughput.wipMode})`);
  lines.push(`- Active PRs: claude ${next.throughput.activeByOwner.claude}, codex ${next.throughput.activeByOwner.codex}, human ${next.throughput.activeByOwner.human}`);
  lines.push(`- Claude blockers: ${next.throughput.blockedClaudeCount}`);
  lines.push(`- Reviewable Claude PRs in coordination.json: ${next.throughput.reviewableClaudeCount}`);
  lines.push(`- ${next.throughput.recommendation}`);
  if (next.recentEvents.length > 0) {
    lines.push("");
    lines.push(`Recent Events ${next.recentEvents.length}`);
    for (const event of next.recentEvents) lines.push(`- ${eventSummary(event)}`);
  }
  const includeClaude = role === "all" || role === "claude";
  const includeCodex = role === "all" || role === "codex";
  if (includeClaude) {
    lines.push("");
    lines.push(`Claude Next ${next.claude.length || "(none)"}`);
    for (const [i, item] of next.claude.entries()) {
      lines.push(`${i + 1}. #${item.pr} ${item.title}`);
      lines.push(`   ${item.action}`);
    }
  }
  if (includeCodex) {
    lines.push("");
    lines.push(`Codex Next ${next.codex.length || "(none)"}`);
    for (const [i, item] of next.codex.entries()) {
      lines.push(`${i + 1}. ${item.pr ? `#${item.pr} ` : ""}${item.title}`);
      lines.push(`   ${item.action}`);
    }
  }
  if (next.humanGated.length > 0) {
    lines.push("");
    lines.push("Human-Gated");
    for (const item of next.humanGated) lines.push(`- #${item.pr} ${item.title}: ${item.action}`);
  }
  lines.push("");
  lines.push("Use: node scripts/agent_next.mjs --role=claude|codex --limit=5");
  lines.push("Tip: add --events-since=<ISO time> to see only events after your last poll, or --no-events for quiet output.");
  return lines.join("\n");
}

const args = parseArgs(process.argv.slice(2));
const recentEvents = args.events ? readRecentEvents(args) : [];
const next = buildNext(readState(args.state), { ...args, recentEvents });
if (args.format === "json") {
  console.log(JSON.stringify(next, null, 2));
} else {
  console.log(formatText(next, args.role));
}
