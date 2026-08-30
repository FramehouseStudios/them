#!/usr/bin/env node
//
// scripts/agent_next.mjs
//
// Prints the next high-leverage actions for Codex and the support lane from
// docs/coordination.json, plus the recent live event tape from
// docs/agent-events-*.jsonl. This is intentionally small and deterministic:
// no GitHub API calls, no network, no dependencies. The coordination file
// remains the durable source of truth; the event tape answers "what just
// happened?"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.AGENT_NEXT_REPO_ROOT
  ? path.resolve(process.env.AGENT_NEXT_REPO_ROOT)
  : path.resolve(__dirname, "..");
const DEFAULT_STATE = path.join(repoRoot, "docs/coordination.json");
const DEFAULT_EVENTS_DIR = path.join(repoRoot, "docs");
const DEFAULT_SUPPORT_INBOX = path.join(repoRoot, "docs/support-inbox.md");

const DONE_STATUSES = new Set(["merged", "closed"]);
const HUMAN_STATUSES = new Set(["needs-human", "policy-gated"]);
const BLOCKED_STATUSES = new Set(["blocked"]);
const REVIEW_STATUSES = new Set(["review", "ready", "ready-for-review"]);

const SUPPORT_PRIORITY = new Map([
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
    supportInbox: DEFAULT_SUPPORT_INBOX,
    staleCheck: true,
    forceStaleCheck: false,
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
    else if (key === "support-inbox") args.supportInbox = path.resolve(value);
    else if (key === "no-stale-check") args.staleCheck = false;
    else if (key === "stale-check") args.forceStaleCheck = true;
  }
  return args;
}

function readState(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function git(args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function readCheckoutStatus({ state, staleCheck, forceStaleCheck }) {
  if (!staleCheck) return null;
  // Avoid making fixture-based tests or ad hoc state-file reads depend on
  // whatever checkout happens to run the script. The default command path is
  // the one agents use for real coordination.
  if (!forceStaleCheck && path.resolve(state) !== DEFAULT_STATE) return null;
  try {
    git(["rev-parse", "--is-inside-work-tree"]);
    const head = git(["rev-parse", "HEAD"]);
    const upstream = git(["rev-parse", "--verify", "origin/main"]);
    const mergeBase = git(["merge-base", "HEAD", "origin/main"]);
    if (head === upstream) {
      return { state: "fresh", head, upstream, message: "Checkout is at origin/main." };
    }
    if (mergeBase === head) {
      return {
        state: "behind",
        head,
        upstream,
        message: "Checkout is behind origin/main; fetch/rebase or use a fresh worktree before acting on this queue.",
      };
    }
    if (mergeBase === upstream) {
      return { state: "ahead", head, upstream, message: "Checkout has local commits ahead of origin/main." };
    }
    return {
      state: "diverged",
      head,
      upstream,
      message: "Checkout has diverged from origin/main; rebase before acting on this queue.",
    };
  } catch {
    return null;
  }
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

function stripMarkdownInline(text) {
  return String(text || "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function readSupportInboxBacklog(file, limit) {
  if (!file || !fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const out = [];
  let inSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+Backend Work Codex Actually Wants Next\b/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (!inSection || !line.startsWith("|")) continue;
    const cols = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cols.length < 4) continue;
    if (/^-+$/.test(cols[0].replace(/\s/g, "")) || /^priority$/i.test(cols[0])) continue;
    const priority = Number(cols[0]);
    if (!Number.isInteger(priority)) continue;
    out.push({
      priority,
      request: stripMarkdownInline(cols[1]),
      why: stripMarkdownInline(cols[2]),
      expectedShape: stripMarkdownInline(cols[3]),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function isDone(pr) {
  return DONE_STATUSES.has(pr.status);
}

function isHumanGated(pr) {
  if (HUMAN_STATUSES.has(pr.status) || /human/i.test(pr.blocker || "")) return true;
  if (pr.tier !== 3) return false;
  // Tier-3 still needs human/Codex merge clearance, but it may also carry
  // concrete support-owned repair work. Do not park those PRs as "human"
  // when the blocker metadata says the next action is an engineering fix.
  return !["needs_test_fix", "needs_rebase", "needs_scope_narrowing"].includes(pr.blocker_kind || "");
}

function isBlocked(pr) {
  return BLOCKED_STATUSES.has(pr.status) || Boolean(pr.blocker);
}

function isReviewable(pr) {
  return pr.owner === "support"
    && !isDone(pr)
    && !isBlocked(pr)
    && !isHumanGated(pr)
    && REVIEW_STATUSES.has(pr.status);
}

function scoreSupport(pr) {
  const pinned = SUPPORT_PRIORITY.get(pr.number);
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

function buildNext(state, { limit, recentEvents = [], supportInbox = null, checkout = null }) {
  const prs = state.openPullRequests || [];
  const active = prs.filter((pr) => !isDone(pr));
  const humanGated = active.filter(isHumanGated);
  const actionableActive = active.filter((pr) => !isHumanGated(pr));
  const activeByOwner = {
    support: actionableActive.filter((pr) => pr.owner === "support").length,
    codex: actionableActive.filter((pr) => pr.owner === "codex").length,
    human: actionableActive.filter((pr) => pr.owner === "human").length,
  };
  const blockedSupport = active.filter((pr) => pr.owner === "support" && isBlocked(pr) && !isHumanGated(pr));
  const reviewableSupport = active.filter(isReviewable);
  const codexOwn = active.filter((pr) => pr.owner === "codex" && !isBlocked(pr));
  const supportInboxBacklog = readSupportInboxBacklog(supportInbox, limit);
  const supportBlockedRatio = activeByOwner.support === 0
    ? 0
    : blockedSupport.length / activeByOwner.support;

  const support = blockedSupport
    .sort((a, b) => scoreSupport(b) - scoreSupport(a) || a.number - b.number)
    .slice(0, limit)
    .map((pr) => ({
      pr: pr.number,
      title: pr.title,
      reason: "clear-blocker",
      action: pr.expected_action || pr.blocker || "Clear blocker and request Codex review.",
    }));
  if (support.length === 0 && supportInboxBacklog.length > 0) {
    for (const item of supportInboxBacklog.slice(0, limit)) {
      support.push({
        pr: null,
        title: item.request,
        reason: "support-inbox-backlog",
        action: `${item.why} Expected: ${item.expectedShape}`,
      });
    }
  }

  const codex = [];
  for (const pr of reviewableSupport.slice(0, limit)) {
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
  if (codex.length === 0 && blockedSupport.length > 0) {
    const top = blockedSupport.sort((a, b) => scoreSupport(b) - scoreSupport(a) || a.number - b.number)[0];
    codex.push({
      pr: top.number,
      title: top.title,
      reason: "supervise-blocker",
      action: "No clean Codex review candidates in coordination.json; press this support blocker or wait for the support lane to update the queue.",
    });
  }

  const wipLimit = supportBlockedRatio >= 0.8 ? 6 : 3;
  return {
    updatedAt: state.updatedAt,
    throughput: {
      wipLimit,
      wipMode: wipLimit === 6 ? "blocker-clearing" : "normal",
      activeByOwner,
      supportOverLimit: activeByOwner.support > wipLimit,
      blockedSupportCount: blockedSupport.length,
      supportBlockedRatio,
      humanGatedCount: humanGated.length,
      reviewableSupportCount: reviewableSupport.length,
      recommendation: activeByOwner.support > wipLimit || blockedSupport.length > 0
        ? "Support should clear existing blockers before opening net-new backend work."
        : humanGated.length > 0
          ? "Human-gated PRs are parked; Support can work from docs/support-inbox.md."
        : "Support has room for one scoped backend task.",
    },
    support,
    codex,
    humanGated: humanGated.slice(0, limit).map((pr) => ({
      pr: pr.number,
      title: pr.title,
      action: pr.blocker || "Needs explicit human approval.",
    })),
    recentEvents,
    checkout,
  };
}

function formatText(next, role) {
  const lines = [];
  lines.push(`agent_next: ${next.updatedAt}`);
  lines.push("");
  lines.push("Throughput");
  lines.push(`- WIP limit per support lane: ${next.throughput.wipLimit} (${next.throughput.wipMode})`);
  lines.push(`- Active PRs: support ${next.throughput.activeByOwner.support}, codex ${next.throughput.activeByOwner.codex}, human ${next.throughput.activeByOwner.human}`);
  lines.push(`- Support blockers: ${next.throughput.blockedSupportCount}`);
  lines.push(`- Reviewable support PRs in coordination.json: ${next.throughput.reviewableSupportCount}`);
  lines.push(`- ${next.throughput.recommendation}`);
  if (next.checkout && ["behind", "diverged"].includes(next.checkout.state)) {
    lines.push("");
    lines.push("Checkout Warning");
    lines.push(`- ${next.checkout.message}`);
  }
  if (next.recentEvents.length > 0) {
    lines.push("");
    lines.push(`Recent Events ${next.recentEvents.length}`);
    for (const event of next.recentEvents) lines.push(`- ${eventSummary(event)}`);
  }
  const includeSupport = role === "all" || role === "support";
  const includeCodex = role === "all" || role === "codex";
  if (includeSupport) {
    lines.push("");
    lines.push(`Support Next ${next.support.length || "(none)"}`);
    for (const [i, item] of next.support.entries()) {
      lines.push(`${i + 1}. ${item.pr ? `#${item.pr} ` : ""}${item.title}`);
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
  lines.push("Use: node scripts/agent_next.mjs --role=support|codex --limit=5");
  lines.push("Tip: add --events-since=<ISO time> to see only events after your last poll, or --no-events for quiet output.");
  return lines.join("\n");
}

const args = parseArgs(process.argv.slice(2));
const recentEvents = args.events ? readRecentEvents(args) : [];
const checkout = readCheckoutStatus(args);
const next = buildNext(readState(args.state), { ...args, recentEvents, checkout });
if (args.format === "json") {
  console.log(JSON.stringify(next, null, 2));
} else {
  console.log(formatText(next, args.role));
}
