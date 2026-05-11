#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").trim();
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
const openPRs = extractSection(inbox, "Current Open Claude PRs");
const contracts = extractSection(inbox, "Endpoint Contracts Ready to Consume");
const blockers = extractSection(inbox, "Blockers Affecting Codex");
const decisions = extractSection(inbox, "Decisions Claude Needs from Codex");

const prompt = [
  "Codex, read these files in order:",
  "1. AGENTS.md",
  "2. TASKS.md",
  "3. DECISIONS.md",
  "4. docs/codex-claude-live-handoff.md",
  `5. ${inboxPath}`,
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
