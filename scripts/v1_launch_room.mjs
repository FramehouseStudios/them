#!/usr/bin/env node
//
// scripts/v1_launch_room.mjs
//
// One-screen V1 launch room for Codex, support agent, and the human. This script
// reads the existing coordination files and turns them into role-specific
// options, so the team stops asking for broad "next 20" batches and can pick
// one high-leverage action.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
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
const validRoles = new Set(["all", "human", "support", "codex"]);
if (!validRoles.has(role)) {
  console.error(`v1-launch-room: invalid --role=${role}; expected all, human, support, or codex`);
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

function parseSupportBacklog(markdown) {
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

function currentBrandProse(value) {
  return String(value || "").replace(/\bio\.them\b(?![./])/gi, "THEM");
}

function summarizeReleaseProof(markdown) {
  if (!markdown) return null;
  const result = markdown.match(/^(?:Result:|Failed:)\s+(.+)$/m)?.[1]?.replace(/[`.]/g, "") || "unknown";
  const blockingHeading = markdown.match(/^## (?:Blocking Checks|Human Clearance Required)$/m)?.[0] || "";
  const blockingStart = blockingHeading ? markdown.indexOf(blockingHeading) : -1;
  const blockingRest = blockingStart === -1 ? "" : markdown.slice(blockingStart);
  const nextSection = blockingRest.slice(blockingHeading.length).search(/\n## /);
  const blockSection = blockingStart === -1
    ? ""
    : blockingRest.slice(0, nextSection === -1 ? undefined : blockingHeading.length + nextSection);
  const blockers = [];
  let active = null;
  for (const line of blockSection.split("\n")) {
    if (/^(?:- |\d+\. )/.test(line)) {
      if (active) blockers.push(active.trim());
      active = line.replace(/^(?:- |\d+\. )/, "").trim();
    } else if (active && /^\s{2,}\S/.test(line)) {
      active += ` ${line.trim()}`;
    }
  }
  if (active) blockers.push(active.trim());
  return {
    result: currentBrandProse(result),
    blockers: blockers.map(currentBrandProse),
  };
}

function isHumanActionGated(pr) {
  if (pr.status === "needs-human" || pr.status === "policy-gated") return true;
  if (/human/i.test(pr.blocker || "")) return true;
  if (pr.tier !== 3) return false;
  return !["needs_test_fix", "needs_rebase", "needs_scope_narrowing"].includes(pr.blocker_kind || "");
}

function readReleaseLocalConfigStatus() {
  const script = path.join(repoRoot, "scripts", "release_config_status.mjs");
  const result = spawnSync(process.execPath, [script, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const parsed = JSON.parse(result.stdout);
    const envPath = parsed.envFile?.path || "them/Release.local.env";
    const blockers = Array.isArray(parsed.blockers) ? [...parsed.blockers] : [];
    const envMissing = parsed.envFile && !parsed.envFile.exists;
    if (envMissing && !blockers.some((blocker) => /missing local release config/i.test(blocker))) {
      blockers.unshift(`missing local release config: ${envPath}`);
    }
    return {
      ...parsed,
      envFile: envPath,
      blockers,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      overall: parsed.ok ? "ready" : envMissing ? "missing" : "blocked",
      exitStatus: result.status,
    };
  } catch (error) {
    return {
      blockers: ["could not read release local config status"],
      envFile: "them/Release.local.env",
      keys: [],
      mode: "",
      overall: "unknown",
      warnings: [error.message],
    };
  }
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
  const supportBacklog = parseSupportBacklog(readText("docs/support-inbox.md"));
  const decisions = extractOpenDecisionTitles(readText("docs/decisions-queue.md"));
  const release = summarizeReleaseProof(readText("docs/v1-release-preflight-proof.md"));
  const releaseLocalConfig = readReleaseLocalConfigStatus();
  const launchDoctor = readLaunchDoctorReport();
  const reviewableSupportPRs = coordination.openPullRequests
    .filter((pr) => pr.owner === "support")
    .filter((pr) => pr.status === "review" || pr.status === "ready")
    .filter((pr) => pr.tier !== 3 && !pr.blocker);
  const humanGated = coordination.openPullRequests
    .filter((pr) => !["closed", "merged"].includes(pr.status))
    .filter(isHumanActionGated);
  const manualSmokeOpen = v1.pillars.some((pillar) =>
    pillar.remaining.some((item) => /manual smoke/i.test(item))
  );
  const supportNext = manualSmokeOpen
    ? {
        request: "Manual smoke blockers need evidence",
        why: "The incomplete V1 product pillars are human smoke paths; fixes should be driven by actual Talk, Studio, Memory, or Realtime evidence.",
        expected: "Stand by for Launch Doctor/manual-smoke evidence, then take one root-cause backend fix at a time and append proof before moving to the next failure.",
      }
    : supportBacklog[0] || {
    request: "Wait for Codex assignment",
    why: "No backend queue row found.",
    expected: "Run node scripts/agent_next.mjs --role=support.",
  };
  const codexNext = reviewableSupportPRs[0]
    ? {
        action: `Review support PR #${reviewableSupportPRs[0].number}: ${reviewableSupportPRs[0].title}`,
        why: "Reviewable support work is waiting.",
      }
    : {
        action: "Run V1 smoke handoff, inspect Launch Doctor output, and fix smoke failures.",
        why: "No reviewable support PR is open; V1 is gated by manual smoke plus release signing/backend/token configuration.",
      };
  const humanOptions = [
    {
      action: "Run V1 Launch Doctor",
      command: "Open Data Controls -> V1 Launch Doctor, or record a pasted block with node scripts/v1_launch_doctor_report.mjs --from-result-block=<file> --write-docs",
      why: "Records Talk, Studio, Memory, Realtime, and iOS Release Readiness as JSON/Markdown launch proof.",
    },
    {
      action: "Run V1 manual smoke",
      command: "node scripts/v1_manual_qa_checklist.mjs --prompt",
      why: "Closes the Talk, Studio, Memory, Realtime, and final iOS signoff checklist items when passing.",
    },
    {
      action: "Clear release preflight config",
      command: "cp them/Release.local.env.example them/Release.local.env && chmod 600 them/Release.local.env && scripts/run_release_preflight.sh",
      why: "Unblocks TestFlight/external review after Debug build/tests and deterministic smokes are green.",
    },
  ];
  if (decisions.some((decision) => /privacy|memory|delete|export/i.test(decision))) {
    humanOptions.splice(2, 0, {
      action: "Answer privacy decisions",
      command: "Open docs/memory-export-delete-decision-packet.md and docs/decisions-queue.md",
      why: "Unblocks or intentionally parks privacy-gated memory work.",
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    v1: v1.overall,
    pillars: v1.pillars,
    supportNext,
    supportBacklog,
    codexNext,
    humanOptions,
    humanGated,
    blockers: coordination.blockers || [],
    decisionsPending: coordination.decisionsPending || [],
    decisionTitles: decisions,
    launchDoctor,
    release,
    releaseLocalConfig,
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
  out.push(`Release local config: ${releaseLocalConfigLine(state.releaseLocalConfig)}`);
  out.push("");
  out.push(`Open decisions: ${state.decisionTitles.length}`);
  for (const decision of state.decisionTitles) out.push(`- ${decision}`);
  return out;
}

function linesForSupport(state) {
  return [
    "Support Launch Options",
    "",
    `Do now: ${state.supportNext.request}`,
    `Why: ${state.supportNext.why}`,
    `Expected: ${state.supportNext.expected}`,
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
    `- Release local config: ${releaseLocalConfigLine(state.releaseLocalConfig)}`,
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

function releaseLocalConfigLine(status) {
  if (!status) return "unknown";
  const blockerCount = Array.isArray(status.blockers) ? status.blockers.length : 0;
  const warningCount = Array.isArray(status.warnings) ? status.warnings.length : 0;
  const mode = status.mode ? `, mode=${status.mode}` : "";
  return `${status.overall || "unknown"} at ${status.envFile || "them/Release.local.env"} (${blockerCount} blockers, ${warningCount} warnings${mode})`;
}

function textOutput(state) {
  const out = [];
  out.push("THEM V1 Launch Room");
  out.push("");
  out.push(`V1: ${state.v1.done}/${state.v1.total} (${state.v1.pct}%)`);
  for (const pillar of state.pillars) {
    const next = pillar.remaining[0] ? ` next: ${truncate(pillar.remaining[0], 58)}` : "";
    out.push(`- ${pillar.pillar}: ${pillar.done}/${pillar.total} (${pillar.pct}%)${next}`);
  }
  out.push("");
  if (role === "all" || role === "support") out.push(...linesForSupport(state), "");
  if (role === "all" || role === "codex") out.push(...linesForCodex(state), "");
  if (role === "all" || role === "human") out.push(...linesForHuman(state), "");
  if (state.release?.blockers?.length) {
    out.push("Release Preflight Blockers");
    for (const blocker of state.release.blockers.slice(0, 6)) out.push(`- ${blocker}`);
  }
  if (state.releaseLocalConfig?.blockers?.length) {
    out.push("");
    out.push("Release Local Config Blockers");
    for (const blocker of state.releaseLocalConfig.blockers.slice(0, 6)) out.push(`- ${blocker}`);
  }
  return out.join("\n").trimEnd();
}

const state = buildState();
if (wantJson) {
  console.log(JSON.stringify(state, null, 2));
} else {
  console.log(textOutput(state));
}
