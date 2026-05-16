#!/usr/bin/env node
//
// scripts/v1_launch_room.mjs
//
// One-screen V1 launch room for Codex, Claude, and the human. This script
// reads the existing coordination files and turns them into role-specific
// options, so the team stops asking for broad "next 20" batches and can pick
// one high-leverage action.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.V1_LAUNCH_ROOM_REPO_ROOT || path.resolve(__dirname, "..");

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const wantJson = process.argv.includes("--json");
const role = arg("role", "all").toLowerCase();
const validRoles = new Set(["all", "human", "claude", "codex"]);
if (!validRoles.has(role)) {
  console.error(`v1-launch-room: invalid --role=${role}; expected all, human, claude, or codex`);
  process.exit(2);
}

function readText(relativePath, fallback = "") {
  const fullPath = path.join(repoRoot, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : fallback;
}

function readJson(relativePath, fallback) {
  const text = readText(relativePath, "");
  return text ? JSON.parse(text) : fallback;
}

function runNodeScript(relativePath, args = []) {
  return execFileSync(process.execPath, [path.join(repoRoot, relativePath), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseClaudeBacklog(markdown) {
  const marker = "## Backend Work Codex Actually Wants Next";
  const start = markdown.indexOf(marker);
  if (start === -1) return [];
  const rest = markdown.slice(start + marker.length);
  const end = rest.search(/\n## /);
  const section = end === -1 ? rest : rest.slice(0, end);
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .map(([priority, request, why, expected]) => ({
      priority: Number(priority),
      request,
      why,
      expected,
    }));
}

function extractOpenDecisionTitles(markdown) {
  const start = markdown.indexOf("## Open");
  if (start === -1) return [];
  const rest = markdown.slice(start);
  const end = rest.indexOf("\n## Resolved");
  const section = end === -1 ? rest : rest.slice(0, end);
  return [...section.matchAll(/^###\s+(.+)$/gm)].map((match) => match[1].trim());
}

function summarizeReleaseProof(markdown) {
  if (!markdown) return null;
  const result = markdown.match(/^Failed:\s+(.+)$/m)?.[1]?.replace(/`/g, "") || "unknown";
  const blockingStart = markdown.indexOf("## Blocking Checks");
  const blockingRest = blockingStart === -1 ? "" : markdown.slice(blockingStart);
  const nextSection = blockingRest.search(/\n## (Warning|Final Preflight Command Shape|Build Log|Boundary)\b/);
  const blockSection = blockingStart === -1
    ? ""
    : blockingRest.slice(0, nextSection === -1 ? undefined : nextSection);
  const blockers = [];
  let active = null;
  for (const line of blockSection.split("\n")) {
    if (line.startsWith("- ")) {
      if (active) blockers.push(active.trim());
      active = line.slice(2).trim();
    } else if (active && /^\s{2,}\S/.test(line)) {
      active += ` ${line.trim()}`;
    }
  }
  if (active) blockers.push(active.trim());
  return { result, blockers };
}

function displayPath(fullPath) {
  const relativeToRepo = path.relative(repoRoot, fullPath);
  if (relativeToRepo && !relativeToRepo.startsWith("..") && !path.isAbsolute(relativeToRepo)) {
    return relativeToRepo;
  }
  const home = os.homedir();
  const relativeToHome = path.relative(home, fullPath);
  if (relativeToHome && !relativeToHome.startsWith("..") && !path.isAbsolute(relativeToHome)) {
    return `~/${relativeToHome}`;
  }
  return fullPath;
}

function launchDoctorReportCandidates() {
  if (process.env.V1_LAUNCH_DOCTOR_REPORT) {
    return [path.resolve(process.env.V1_LAUNCH_DOCTOR_REPORT)];
  }
  return [
    path.join(repoRoot, "docs", "v1-launch-doctor.latest.json"),
    path.join(os.homedir(), "Downloads", "io_them_v1_launch_doctor.latest.json"),
  ];
}

function readLaunchDoctorReport() {
  const candidates = launchDoctorReportCandidates();
  for (const fullPath of candidates) {
    if (!fs.existsSync(fullPath)) continue;
    try {
      const report = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const summary = report.summary || {};
      return {
        status: "found",
        path: displayPath(fullPath),
        schemaVersion: report.schemaVersion || null,
        generatedAt: report.generatedAt || null,
        overallStatus: report.overallStatus || "unknown",
        passed: Number(summary.passed || 0),
        total: Number(summary.total || 0),
        failed: Number(summary.failed || 0),
      };
    } catch (error) {
      return {
        status: "invalid",
        path: displayPath(fullPath),
        error: error.message,
      };
    }
  }
  return {
    status: "missing",
    expectedPath: displayPath(candidates[0]),
    expectedPaths: candidates.map(displayPath),
  };
}

function buildState() {
  const v1 = JSON.parse(runNodeScript("scripts/v1_status.mjs", ["--json"]));
  const coordination = readJson("docs/coordination.json", {
    openPullRequests: [],
    blockers: [],
    decisionsPending: [],
  });
  const claudeBacklog = parseClaudeBacklog(readText("docs/claude-inbox.md"));
  const decisions = extractOpenDecisionTitles(readText("docs/decisions-queue.md"));
  const release = summarizeReleaseProof(readText("docs/v1-release-preflight-proof.md"));
  const launchDoctor = readLaunchDoctorReport();
  const reviewableClaudePRs = coordination.openPullRequests
    .filter((pr) => pr.owner === "claude")
    .filter((pr) => pr.status === "review" || pr.status === "ready")
    .filter((pr) => pr.tier !== 3 && !pr.blocker);
  const humanGated = coordination.openPullRequests
    .filter((pr) => !["closed", "merged"].includes(pr.status))
    .filter((pr) => pr.tier === 3 || pr.status === "needs-human" || /human/i.test(pr.blocker || ""));
  const claudeNext = claudeBacklog[0] || {
    request: "Wait for Codex assignment",
    why: "No backend queue row found.",
    expected: "Run node scripts/agent_next.mjs --role=claude.",
  };
  const codexNext = reviewableClaudePRs[0]
    ? {
        action: `Review Claude PR #${reviewableClaudePRs[0].number}: ${reviewableClaudePRs[0].title}`,
        why: "Reviewable Claude work is waiting.",
      }
    : {
        action: "Run V1 smoke handoff, inspect Launch Doctor output, and fix smoke failures.",
        why: "No reviewable Claude PR is open; V1 is gated by manual smoke, release config, and human decisions.",
      };
  const humanOptions = [
    {
      action: "Run V1 Launch Doctor",
      command: "Open Data Controls -> V1 Launch Doctor, or record a pasted block with node scripts/v1_launch_doctor_report.mjs --from-result-block=<file> --write-docs",
      why: "Records the Talk, Studio, Memory, and Realtime smoke result as JSON/Markdown launch proof.",
    },
    {
      action: "Run V1 manual smoke",
      command: "node scripts/v1_manual_qa_checklist.mjs --prompt",
      why: "Closes the Talk, Studio, Memory, Realtime, and final iOS signoff checklist items when passing.",
    },
    {
      action: "Answer privacy decisions",
      command: "Open docs/memory-export-delete-decision-packet.md and docs/decisions-queue.md",
      why: "Unblocks or intentionally parks PR #94 and PR #99.",
    },
    {
      action: "Clear release preflight config",
      command: "cp them/Release.local.env.example them/Release.local.env && chmod 600 them/Release.local.env && scripts/run_release_preflight.sh",
      why: "Unblocks TestFlight/external review after Debug build/tests and deterministic smokes are green.",
    },
  ];
  return {
    generatedAt: new Date().toISOString(),
    v1: v1.overall,
    pillars: v1.pillars,
    claudeNext,
    claudeBacklog,
    codexNext,
    humanOptions,
    humanGated,
    blockers: coordination.blockers || [],
    decisionsPending: coordination.decisionsPending || [],
    decisionTitles: decisions,
    launchDoctor,
    release,
  };
}

function truncate(text, limit = 82) {
  if (!text || text.length <= limit) return text || "";
  return `${text.slice(0, limit - 1)}…`;
}

function linesForHuman(state) {
  const out = [];
  out.push("Human Launch Options");
  out.push("");
  for (const [index, option] of state.humanOptions.entries()) {
    out.push(`${index + 1}. ${option.action}`);
    out.push(`   Command: ${option.command}`);
    out.push(`   Why: ${option.why}`);
  }
  out.push("");
  out.push(`Launch Doctor: ${launchDoctorLine(state.launchDoctor)}`);
  out.push("");
  out.push(`Open decisions: ${state.decisionTitles.length}`);
  for (const decision of state.decisionTitles) out.push(`- ${decision}`);
  return out;
}

function linesForClaude(state) {
  return [
    "Claude Launch Options",
    "",
    `Do now: ${state.claudeNext.request}`,
    `Why: ${state.claudeNext.why}`,
    `Expected: ${state.claudeNext.expected}`,
    "",
    "Rules:",
    "- One deep backend task only.",
    "- No schema-only or side-lane PRs unless Codex asks.",
    "- Append an event-lane update when the PR opens or state changes.",
  ];
}

function linesForCodex(state) {
  return [
    "Codex Launch Options",
    "",
    `Do now: ${state.codexNext.action}`,
    `Why: ${state.codexNext.why}`,
    "",
    "Watch:",
    `- Human-gated PRs: ${state.humanGated.map((pr) => `#${pr.number}`).join(", ") || "none"}`,
    `- Launch Doctor: ${launchDoctorLine(state.launchDoctor)}`,
    `- Release preflight: ${state.release ? state.release.result : "no proof found"}`,
  ];
}

function launchDoctorLine(report) {
  if (!report || report.status === "missing") {
    const expected = report?.expectedPaths?.length
      ? report.expectedPaths.join(" or ")
      : report?.expectedPath || "expected path unknown";
    return `no report yet (${expected})`;
  }
  if (report.status === "invalid") {
    return `invalid report at ${report.path}: ${report.error}`;
  }
  return `${report.overallStatus} ${report.passed}/${report.total} passed, failed=${report.failed}, path=${report.path}`;
}

function textOutput(state) {
  const out = [];
  out.push("io.them V1 Launch Room");
  out.push("");
  out.push(`V1: ${state.v1.done}/${state.v1.total} (${state.v1.pct}%)`);
  for (const pillar of state.pillars) {
    const next = pillar.remaining[0] ? ` next: ${truncate(pillar.remaining[0], 58)}` : "";
    out.push(`- ${pillar.pillar}: ${pillar.done}/${pillar.total} (${pillar.pct}%)${next}`);
  }
  out.push("");
  if (role === "all" || role === "claude") out.push(...linesForClaude(state), "");
  if (role === "all" || role === "codex") out.push(...linesForCodex(state), "");
  if (role === "all" || role === "human") out.push(...linesForHuman(state), "");
  if (state.release?.blockers?.length) {
    out.push("Release Preflight Blockers");
    for (const blocker of state.release.blockers.slice(0, 6)) out.push(`- ${blocker}`);
  }
  return out.join("\n").trimEnd();
}

const state = buildState();
if (wantJson) {
  console.log(JSON.stringify(state, null, 2));
} else {
  console.log(textOutput(state));
}
