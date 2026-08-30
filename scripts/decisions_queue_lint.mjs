#!/usr/bin/env node
//
// scripts/decisions_queue_lint.mjs
//
// Lints `docs/decisions-queue.md` against the format declared in
// the file's own preamble. The format support agent PR #104 also parses
// programmatically, so drift between the two would silently corrupt
// the read endpoint.
//
// Rules:
//   1. File parses (has `## Open` and `## Resolved` section
//      headers).
//   2. Every entry under `## Open` follows
//      `### D-<slug> — <one-line question>`.
//   3. Each open entry has at least the recommended fields:
//      `Asked by`, `Asked at` (ISO YYYY-MM-DD), and one of
//      `Question` / `Why it matters` / `Default if no answer`.
//   4. `Asked at` is an ISO-8601 calendar date.
//   5. Slugs are unique across both Open and Resolved.
//
// Default exits 0 with findings printed. `--strict` exits non-zero
// on any finding so the future CI flip is one flag.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const FILE = path.join(repoRoot, "docs", "decisions-queue.md");

function readFileSafe(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
}

function parseDecisions(text) {
  const out = { open: [], resolved: [], hasOpenHeader: false, hasResolvedHeader: false };
  if (!text) return out;
  const lines = text.split(/\r?\n/);
  let section = null;
  let current = null;
  function flush() {
    if (!current || !section) return;
    if (section === "open") out.open.push(current);
    else if (section === "resolved") out.resolved.push(current);
    current = null;
  }
  for (const raw of lines) {
    const line = raw.replace(/\s+$/u, "");
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      flush();
      const name = h2[1].toLowerCase();
      if (name === "open") { section = "open"; out.hasOpenHeader = true; }
      else if (name === "resolved") { section = "resolved"; out.hasResolvedHeader = true; }
      else section = null;
      continue;
    }
    if (!section) continue;
    const entry = line.match(/^###\s+(D-[A-Za-z0-9_-]+)\s*(?:—|--|-)\s*(.+?)\s*$/);
    if (entry) {
      flush();
      current = { id: entry[1], title: entry[2], fields: {} };
      continue;
    }
    if (!current) continue;
    const fieldLine = line.match(/^\s*-\s+\*\*([^*]+?)\s*:?\s*\*\*\s*:?\s*(.*)$/);
    if (fieldLine) {
      const key = fieldLine[1].replace(/:+\s*$/u, "").trim().toLowerCase().replace(/\s+/g, "_");
      current.fields[key] = fieldLine[2].trim();
    }
  }
  flush();
  return out;
}

const text = readFileSafe(FILE);
const parsed = parseDecisions(text);

const findings = [];

if (!text) findings.push(`docs/decisions-queue.md is missing or empty`);
if (text && !parsed.hasOpenHeader) findings.push(`missing "## Open" section header`);
if (text && !parsed.hasResolvedHeader) findings.push(`missing "## Resolved" section header`);

const RECOMMENDED_FIELDS = ["asked_by", "asked_at"];
const SUGGESTED_BODY_FIELDS = ["question", "why_it_matters", "default_if_no_answer"];

for (const entry of parsed.open) {
  const label = `open entry ${entry.id}`;
  for (const f of RECOMMENDED_FIELDS) {
    if (!entry.fields[f]) findings.push(`${label}: missing **${f.replace(/_/g, " ")}** field`);
  }
  const hasOneSuggested = SUGGESTED_BODY_FIELDS.some((f) => entry.fields[f]);
  if (!hasOneSuggested) {
    findings.push(`${label}: missing all of Question / Why it matters / Default if no answer`);
  }
  if (entry.fields.asked_at && !/^\d{4}-\d{2}-\d{2}$/.test(entry.fields.asked_at)) {
    findings.push(`${label}: asked_at "${entry.fields.asked_at}" is not YYYY-MM-DD`);
  }
}

const seenIds = new Map();
for (const entry of [...parsed.open, ...parsed.resolved]) {
  if (seenIds.has(entry.id)) {
    findings.push(`duplicate entry id ${entry.id} (appears in ${seenIds.get(entry.id)} and again here)`);
  } else {
    seenIds.set(entry.id, parsed.open.includes(entry) ? "Open" : "Resolved");
  }
}

const strict = process.argv.includes("--strict");
if (findings.length > 0) {
  const label = strict ? "decisions-queue-lint: FAILED" : "decisions-queue-lint: warnings (run with --strict to fail)";
  console.error(label);
  for (const f of findings) console.error(`  - ${f}`);
  if (strict) process.exit(1);
} else {
  console.log(`decisions-queue-lint: OK (${parsed.open.length} open, ${parsed.resolved.length} resolved)`);
}
