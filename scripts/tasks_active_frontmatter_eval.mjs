#!/usr/bin/env node
//
// scripts/tasks_active_frontmatter_eval.mjs
//
// Asserts that every file in `tasks/_active/` either:
//
//   (a) opens with a YAML-style `---` front-matter block carrying
//       id, title, owner ∈ {support, codex, human}, status, branch,
//       AND the id matches the filename — the canonical support agent
//       layout shipped by PR #67; or
//
//   (b) opens with `# Tn — <title>` and includes Owner: / Status: /
//       Branch: lines — the legacy Codex layout for T42-T56.
//
// Findings are printed as a per-file diff. Default mode warns and
// exits 0; `--strict` exits non-zero so CI can gate.
//
// This sits next to scripts/tasks_sync_check.mjs (PR #107) — which
// validates the TASKS.md ↔ tasks/_active/ row mapping. This script
// validates the *content* of each task file.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const activeDir = path.join(repoRoot, "tasks/_active");

const ALLOWED_OWNERS = new Set(["support", "codex", "human"]);
const ALLOWED_STATUSES_PREFIX = [
  "ready",
  "in-progress",
  "review",
  "merged",
  "blocked",
  "planned",
  "open",
  "parked",
  "closed",
  "draft",
];

function parseYamlFrontMatter(text) {
  if (!text.startsWith("---\n")) return null;
  const close = text.indexOf("\n---\n", 4);
  if (close === -1) return null;
  const block = text.slice(4, close);
  const front = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    front[m[1]] = m[2].trim();
  }
  return front;
}

function parseLegacyHeader(text) {
  // Codex-style: "# T49 — Post-T48 Coordination Refresh" then
  // "Owner: codex", "Status: in-progress", "Branch: codex/T49-..."
  const lines = text.split("\n");
  const titleLine = lines[0] || "";
  const tm = titleLine.match(/^#\s+(T\d+|T-[A-Za-z0-9_-]+)\s+—\s+(.+?)\s*$/);
  if (!tm) return null;
  const out = { id: tm[1], title: tm[2] };
  for (const line of lines.slice(1, 12)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s+(.*)$/);
    if (!m) continue;
    out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

function validateOne(filename, text) {
  const findings = [];
  const yaml = parseYamlFrontMatter(text);
  if (yaml) {
    // (a) YAML path
    if (!yaml.id) findings.push("missing front-matter `id`");
    if (yaml.id) {
      // Accept either `<id>.md` (support agent convention) or `<id>-<slug>.md`
      // (Codex convention for numbered Txx tasks).
      const exact = yaml.id + ".md" === filename;
      const prefixed = filename.startsWith(yaml.id + "-");
      if (!exact && !prefixed) {
        findings.push(`id "${yaml.id}" does not match filename`);
      }
    }
    if (!yaml.title) findings.push("missing front-matter `title`");
    if (!yaml.owner) findings.push("missing front-matter `owner`");
    else if (!ALLOWED_OWNERS.has(yaml.owner)) {
      findings.push(`owner "${yaml.owner}" not in {support, codex, human}`);
    }
    if (!yaml.status) findings.push("missing front-matter `status`");
    else if (!ALLOWED_STATUSES_PREFIX.some((p) => yaml.status.startsWith(p))) {
      findings.push(`status "${yaml.status}" does not start with a known prefix`);
    }
    if (!yaml.branch) findings.push("missing front-matter `branch`");
    return findings;
  }
  const legacy = parseLegacyHeader(text);
  if (legacy) {
    // (b) Legacy header path
    if (legacy.id + ".md" !== filename && !filename.startsWith(legacy.id + "-")) {
      findings.push(`legacy id "${legacy.id}" does not match filename`);
    }
    if (!legacy.owner) findings.push("missing legacy `Owner:` line");
    else if (!ALLOWED_OWNERS.has(legacy.owner)) {
      findings.push(`legacy owner "${legacy.owner}" not in {support, codex, human}`);
    }
    if (!legacy.status) findings.push("missing legacy `Status:` line");
    return findings;
  }
  return ["file does not open with YAML front matter or `# Tn — title` header"];
}

const strict = process.argv.includes("--strict");
let totalFindings = 0;
const perFile = [];

if (fs.existsSync(activeDir)) {
  for (const filename of fs.readdirSync(activeDir).sort()) {
    if (!filename.endsWith(".md")) continue;
    if (filename === "README.md") continue;
    const text = fs.readFileSync(path.join(activeDir, filename), "utf8");
    const findings = validateOne(filename, text);
    if (findings.length > 0) {
      perFile.push({ filename, findings });
      totalFindings += findings.length;
    }
  }
}

if (totalFindings > 0) {
  const header = strict
    ? "tasks-active-frontmatter-eval: FAILED"
    : `tasks-active-frontmatter-eval: ${totalFindings} finding(s) (run with --strict to fail)`;
  console.error(header);
  for (const { filename, findings } of perFile) {
    console.error(`  ${filename}:`);
    for (const f of findings) console.error(`    - ${f}`);
  }
  if (strict) process.exit(1);
  process.exit(0);
}
console.log(`tasks-active-frontmatter-eval: OK (${fs.readdirSync(activeDir).filter((f) => f.endsWith(".md") && f !== "README.md").length} task files)`);
