#!/usr/bin/env node
//
// scripts/build_tasks_md.mjs
//
// Reads `tasks/_active/*.md` (per-row task files with YAML-style
// front matter) and renders:
//   - a quick-view markdown table
//   - per-task detail blocks
//
// Default action: print to stdout. Pass `--write` to overwrite the
// section between the two anchor comments inside `TASKS.md`:
//
//   <!-- BEGIN AUTOGEN active-tasks -->
//   ...generated content...
//   <!-- END AUTOGEN active-tasks -->
//
// The anchors must appear as standalone lines (surrounded by
// newlines). Inline mentions inside descriptions / code spans are
// ignored. `--write` is a no-op until at least one standalone pair
// is present.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const activeDir = path.join(repoRoot, "tasks/_active");
const tasksMd = path.join(repoRoot, "TASKS.md");

const BEGIN_ANCHOR = "<!-- BEGIN AUTOGEN active-tasks -->";
const END_ANCHOR = "<!-- END AUTOGEN active-tasks -->";

function parseFrontMatter(text) {
  if (!text.startsWith("---\n")) return { front: {}, body: text };
  const close = text.indexOf("\n---\n", 4);
  if (close === -1) return { front: {}, body: text };
  const block = text.slice(4, close);
  const body = text.slice(close + 5);
  const front = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    front[m[1]] = m[2].trim();
  }
  return { front, body: body.trimStart() };
}

function loadActiveTasks() {
  if (!fs.existsSync(activeDir)) return [];
  const out = [];
  for (const filename of fs.readdirSync(activeDir).sort()) {
    if (!filename.endsWith(".md")) continue;
    if (filename === "README.md") continue;
    const text = fs.readFileSync(path.join(activeDir, filename), "utf8");
    const { front, body } = parseFrontMatter(text);
    if (!front.id) continue;
    if (front.id + ".md" !== filename) {
      console.error(`warning: ${filename} front matter id=${front.id} does not match filename`);
    }
    out.push({ ...front, body, filename });
  }
  return out;
}

function padRight(s, width) {
  const str = String(s);
  if (str.length >= width) return str;
  return str + " ".repeat(width - str.length);
}

function renderQuickViewTable(tasks) {
  const ids = tasks.map((t) => t.id);
  const titles = tasks.map((t) => t.title || "");
  const owners = tasks.map((t) => t.owner || "");
  const statuses = tasks.map((t) => t.status || "");
  const idW = Math.max(4, ...ids.map((s) => s.length));
  const titleW = Math.max(5, ...titles.map((s) => s.length));
  const ownerW = Math.max(5, ...owners.map((s) => s.length));
  const statusW = Math.max(6, ...statuses.map((s) => s.length));

  const head =
    `| ${padRight("ID", idW)} | ${padRight("Title", titleW)} | ${padRight("Owner", ownerW)} | ${padRight("Status", statusW)} |`;
  const sep =
    `|${"-".repeat(idW + 2)}|${"-".repeat(titleW + 2)}|${"-".repeat(ownerW + 2)}|${"-".repeat(statusW + 2)}|`;
  const rows = tasks.map(
    (t) =>
      `| ${padRight(t.id, idW)} | ${padRight(t.title || "", titleW)} | ${padRight(t.owner || "", ownerW)} | ${padRight(t.status || "", statusW)} |`,
  );
  return [head, sep, ...rows].join("\n");
}

function renderDetailBlock(task) {
  const lines = [];
  lines.push(`### ${task.id} — ${task.title || ""}`);
  lines.push(`- **Owner:** ${task.owner || "?"}`);
  lines.push(`- **Branch:** ${task.branch || "—"}`);
  if (task.pillar) lines.push(`- **Pillar:** ${task.pillar}`);
  lines.push(`- **Status:** ${task.status || "?"}`);
  if (task.body && task.body.trim()) {
    lines.push("");
    lines.push(task.body.trim());
  }
  return lines.join("\n");
}

function renderAll(tasks) {
  const out = [];
  out.push(BEGIN_ANCHOR);
  out.push("");
  out.push("## Active work — quick view (auto-generated from tasks/_active/)");
  out.push("");
  out.push(renderQuickViewTable(tasks));
  out.push("");
  out.push("## Active work — full detail (auto-generated)");
  out.push("");
  for (const t of tasks) {
    out.push(renderDetailBlock(t));
    out.push("");
  }
  out.push(END_ANCHOR);
  return out.join("\n");
}

// Find an anchor that sits alone on its own line (surrounded by
// newlines or buffer ends). Skips inline occurrences inside
// descriptions / code spans.
function findStandaloneAnchor(text, anchor) {
  let from = 0;
  while (true) {
    const idx = text.indexOf(anchor, from);
    if (idx === -1) return -1;
    const startOk = idx === 0 || text[idx - 1] === "\n";
    const endChar = text[idx + anchor.length];
    const endOk = endChar === undefined || endChar === "\n";
    if (startOk && endOk) return idx;
    from = idx + 1;
  }
}

function writeIntoTasksMd(rendered) {
  if (!fs.existsSync(tasksMd)) {
    console.error("TASKS.md not found");
    process.exit(1);
  }
  const current = fs.readFileSync(tasksMd, "utf8");
  const beginIdx = findStandaloneAnchor(current, BEGIN_ANCHOR);
  const endIdx = findStandaloneAnchor(current, END_ANCHOR);
  if (beginIdx === -1 || endIdx === -1) {
    console.error(
      "TASKS.md does not contain the autogen anchors as standalone lines.\n" +
        "Add these two lines somewhere in TASKS.md to enable --write:\n" +
        `  ${BEGIN_ANCHOR}\n` +
        `  ${END_ANCHOR}\n`,
    );
    process.exit(2);
  }
  if (beginIdx >= endIdx) {
    console.error(`autogen anchors out of order in TASKS.md (begin=${beginIdx} >= end=${endIdx})`);
    process.exit(2);
  }
  const before = current.slice(0, beginIdx);
  const after = current.slice(endIdx + END_ANCHOR.length);
  fs.writeFileSync(tasksMd, before + rendered + after);
  console.log(`wrote autogen section to TASKS.md (${rendered.length} chars)`);
}

const args = process.argv.slice(2);
const tasks = loadActiveTasks();

if (args.includes("--write")) {
  writeIntoTasksMd(renderAll(tasks));
} else {
  console.log(renderAll(tasks));
}
