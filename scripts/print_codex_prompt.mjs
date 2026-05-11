#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").trim();
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function extractSection(markdown, heading) {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) return "";
  const rest = markdown.slice(start + marker.length);
  const next = rest.search(/\n## /);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

const inboxPath = "docs/codex-inbox.md";
const inbox = readText(inboxPath);
const coordination = readJson("docs/coordination.json");
const openPRs = extractSection(inbox, "Current Open Claude PRs");
const contracts = extractSection(inbox, "Endpoint Contracts Ready to Consume");
const blockers = extractSection(inbox, "Blockers Affecting Codex");
const decisions = extractSection(inbox, "Decisions Claude Needs from Codex");

function formatCoordinationState(state) {
  const prs = state.openPullRequests
    .map((pr) => {
      const blocker = pr.blocker ? ` blocker: ${pr.blocker}` : "";
      return `- #${pr.number} [${pr.status}] tier-${pr.tier} ${pr.owner}: ${pr.title}${blocker}`;
    })
    .join("\n") || "- none";
  const blockers = state.blockers
    .map((blocker) => `- ${blocker.id} (${blocker.owner}): ${blocker.summary}`)
    .join("\n") || "- none";
  return [
    `updatedAt: ${state.updatedAt} by ${state.updatedBy}`,
    "Open PRs:",
    prs,
    "Blockers:",
    blockers,
  ].join("\n");
}

const prompt = [
  "Codex, read these files in order:",
  "1. AGENTS.md",
  "2. TASKS.md",
  "3. DECISIONS.md",
  "4. docs/codex-claude-live-handoff.md",
  "5. docs/coordination.json",
  `6. ${inboxPath}`,
  "",
  "Machine-readable coordination state:",
  formatCoordinationState(coordination),
  "",
  "Currently open Claude PRs awaiting Codex action:",
  openPRs,
  "",
  "Endpoint contracts ready for Codex iOS consumers:",
  contracts,
  "",
  "Blockers affecting Codex:",
  blockers,
  "",
  "Decisions Claude needs from Codex:",
  decisions,
  "",
  "Rules: one branch per task, one PR per branch, do not modify Claude-owned branches except by review comments, and report exactly what you ran.",
].join("\n");

console.log(prompt);
