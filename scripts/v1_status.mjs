#!/usr/bin/env node
//
// scripts/v1_status.mjs
//
// Parses docs/v1-definition.md and emits a single-screen status
// report of the V1 checklist: per-pillar completion percentage,
// blocked vs in-flight items, and the next-best-action shortlist.
//
// Why: docs/v1-definition.md has 30+ checklist items across 5
// pillars. Right now both agents have to scroll the doc to know
// where V1 stands. This script reads the markdown checkboxes and
// answers "what's left to V1?" in 20 lines of output.
//
// V1 pillar: infra
// V1 effect: infrastructure for every V1 checklist item — gives
// both agents (and the human) a single command that reports V1
// status without scrolling the doc.
//
// Usage:
//   node scripts/v1_status.mjs
//   node scripts/v1_status.mjs --json
//   node scripts/v1_status.mjs --pillar=talk

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const docPath = path.join(repoRoot, "docs", "v1-definition.md");

function arg(name, fallback) {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.slice(`--${name}=`.length) : fallback;
}

const wantJson = process.argv.includes("--json");
const pillarFilter = (arg("pillar", "") || "").toLowerCase().trim();

if (!fs.existsSync(docPath)) {
  console.error(`v1-status: ${docPath} not found`);
  process.exit(2);
}

const text = fs.readFileSync(docPath, "utf8");
const lines = text.split("\n");

// Parse: H2 headings are pillar names. Each `- [x] ...` / `- [ ] ...`
// under a heading is a checklist item belonging to that pillar.
//
// Wrapped checkbox items: a checkbox line may continue on subsequent
// indented (2+ space) non-checkbox, non-heading lines. The parser
// collects those continuations into the item's text so we don't drop
// the tail of multi-line checklist entries.
//
// Example:
//   - [x] Character mentions, traits, archetypes, accepted twists, and block
//         history have backend/iOS surfaces.
// → one item: "Character mentions, ... and block history have backend/iOS surfaces."
const pillars = [];
let current = null;
let activeItem = null;
function finalizeActiveItem() {
  if (!activeItem) return;
  const text = activeItem.parts.join(" ").trim()
    .replace(/\s+/g, " ")
    .replace(/\s+\([^)]*\)\s*$/, "")
    .trim();
  activeItem.target.push({ done: activeItem.done, text });
  activeItem = null;
}
for (const raw of lines) {
  const line = raw.replace(/\r$/, "");
  const h2 = line.match(/^## (.+)$/);
  if (h2) {
    finalizeActiveItem();
    const title = h2[1].trim();
    // Skip non-pillar headings.
    if (/v1 promise|pr rule/i.test(title)) {
      current = null;
      continue;
    }
    current = { title, slug: title.toLowerCase().replace(/\s+/g, "-"), items: [] };
    pillars.push(current);
    continue;
  }
  if (!current) continue;
  const checkbox = line.match(/^- \[([ x])\] (.+)$/i);
  if (checkbox) {
    finalizeActiveItem();
    activeItem = {
      target: current.items,
      done: checkbox[1].toLowerCase() === "x",
      parts: [checkbox[2].trim()],
    };
    continue;
  }
  // Continuation line: indented (>= 2 spaces) and non-empty and not
  // a new structural element. Collect into the active checkbox.
  if (activeItem && /^\s{2,}\S/.test(line)) {
    activeItem.parts.push(line.trim());
    continue;
  }
  // Any other line ends the current item (blank, heading, non-indented).
  if (line.trim() === "" || /^- /.test(line) || /^#/.test(line)) {
    finalizeActiveItem();
  }
}
// EOF — flush any item still being collected.
finalizeActiveItem();

function pct(done, total) {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

const summary = pillars.map((p) => {
  const total = p.items.length;
  const done = p.items.filter((i) => i.done).length;
  const remaining = p.items.filter((i) => !i.done).map((i) => i.text);
  return {
    pillar: p.title,
    slug: p.slug,
    done,
    total,
    pct: pct(done, total),
    remaining,
  };
});

const totalItems = summary.reduce((s, p) => s + p.total, 0);
const doneItems = summary.reduce((s, p) => s + p.done, 0);
const overallPct = pct(doneItems, totalItems);

const filtered = pillarFilter
  ? summary.filter((p) => p.slug.includes(pillarFilter) || p.pillar.toLowerCase().includes(pillarFilter))
  : summary;

if (wantJson) {
  console.log(JSON.stringify({
    overall: { done: doneItems, total: totalItems, pct: overallPct },
    pillars: filtered,
    sourcePath: path.relative(repoRoot, docPath),
  }, null, 2));
  process.exit(0);
}

console.log(`V1 status — overall ${doneItems}/${totalItems} (${overallPct}%)`);
console.log("");
console.log("| Pillar | Done | Total | % | Next remaining |");
console.log("| --- | --- | --- | --- | --- |");
for (const p of filtered) {
  const next = p.remaining[0] ? p.remaining[0].slice(0, 50) + (p.remaining[0].length > 50 ? "…" : "") : "—";
  console.log(`| ${p.pillar} | ${p.done} | ${p.total} | ${p.pct}% | ${next} |`);
}
if (filtered.some((p) => p.remaining.length > 0)) {
  console.log("");
  console.log("Remaining work by pillar:");
  for (const p of filtered) {
    if (p.remaining.length === 0) continue;
    console.log(`\n  ${p.pillar} (${p.remaining.length} remaining):`);
    for (const r of p.remaining) console.log(`    - ${r}`);
  }
}
process.exit(0);
