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

const inboxPath = "docs/claude-inbox.md";
const inbox = readText(inboxPath);
const currentCommand = extractSection(inbox, "Current Command");
const supervisorStatus = extractSection(inbox, "Codex Supervisor Status");

const prompt = [
  "Claude, read these files in order:",
  "1. AGENTS.md",
  "2. TASKS.md",
  "3. DECISIONS.md",
  "4. docs/codex-claude-live-handoff.md",
  `5. ${inboxPath}`,
  "",
  "Then follow this current command:",
  currentCommand,
  "",
  "Current Codex supervisor status:",
  supervisorStatus,
  "",
  "Rules: one branch per task, one PR per branch, do not weaken gates, and report exactly what you ran.",
].join("\n");

console.log(prompt);
