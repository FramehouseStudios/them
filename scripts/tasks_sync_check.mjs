#!/usr/bin/env node
//
// scripts/tasks_sync_check.mjs
//
// Asserts that every `tasks/_active/T-*.md` file has a matching row in
// `TASKS.md` (same `id` in the front matter, same `status` column).
// Exits non-zero with a clear diff when they drift.
//
// This is a safety net for the period before `--write` flips
// `TASKS.md` to be a build artifact. Until then, agents edit both
// places by hand; this script catches the inevitable drift.
//
// Default: warn-only — prints findings and exits 0 so it's safe to
// wire into observability without breaking CI today. Pass `--strict`
// to exit non-zero on any drift (use once the existing drift is
// cleaned up).
//
// Run: `node scripts/tasks_sync_check.mjs [--strict]`

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const activeDir = path.join(repoRoot, "tasks/_active");
const tasksMd = path.join(repoRoot, "TASKS.md");

function parseFrontMatter(text) {
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

function loadActiveTaskFiles() {
  if (!fs.existsSync(activeDir)) return [];
  const out = [];
  for (const filename of fs.readdirSync(activeDir).sort()) {
    if (!filename.endsWith(".md")) continue;
    if (filename === "README.md") continue;
    const text = fs.readFileSync(path.join(activeDir, filename), "utf8");
    const front = parseFrontMatter(text);
    if (!front) {
      out.push({ filename, error: "missing_or_invalid_front_matter" });
      continue;
    }
    out.push({ filename, id: front.id, status: front.status, owner: front.owner });
  }
  return out;
}

function parseTasksMdRows(text) {
  // Match table rows of the form: | T-slug | title | owner | status |
  // The active section sits between "## Active" and the next H2.
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    // Skip the header / separator rows.
    if (/^\|\s*[-:|\s]+\|$/.test(line)) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    const id = cells[0];
    if (!/^T[-A-Za-z0-9_]/.test(id)) continue;
    const owner = cells[cells.length - 2];
    const status = cells[cells.length - 1];
    const title = cells.slice(1, -2).join("|").trim();
    rows.push({ id, title, owner, status });
  }
  return rows;
}

function main() {
  const files = loadActiveTaskFiles();
  const tasksText = fs.readFileSync(tasksMd, "utf8");
  const rows = parseTasksMdRows(tasksText);
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const errors = [];
  for (const f of files) {
    if (f.error) {
      errors.push(`${f.filename}: ${f.error}`);
      continue;
    }
    if (!f.id) {
      errors.push(`${f.filename}: missing front-matter id`);
      continue;
    }
    if (`${f.id}.md` !== f.filename) {
      errors.push(`${f.filename}: front-matter id=${f.id} does not match filename`);
    }
    const row = rowById.get(f.id);
    if (!row) {
      errors.push(`${f.filename}: no row in TASKS.md for id=${f.id}`);
      continue;
    }
    if (row.status && f.status && row.status !== f.status) {
      errors.push(
        `${f.filename}: status mismatch — TASKS.md says "${row.status}", task file says "${f.status}"`,
      );
    }
    if (row.owner && f.owner && row.owner !== f.owner) {
      errors.push(
        `${f.filename}: owner mismatch — TASKS.md says "${row.owner}", task file says "${f.owner}"`,
      );
    }
  }

  const strict = process.argv.includes("--strict");
  if (errors.length > 0) {
    const label = strict ? "tasks-sync-check: FAILED" : "tasks-sync-check: warnings (run with --strict to fail)";
    console.error(label);
    for (const e of errors) console.error(`  - ${e}`);
    if (strict) process.exit(1);
    return;
  }
  console.log(`tasks-sync-check: OK (${files.length} active task files)`);
}

main();
