#!/usr/bin/env node
//
// scripts/tasks_active_stats.mjs
//
// At-a-glance counts over the `tasks/_active/` directory:
//
//   - total task files
//   - by owner (claude / codex / human)
//   - by status (review / in-progress / merged / blocked / ...)
//   - by pillar (when the YAML front matter has one)
//
// Default mode prints a human-readable summary. Pass `--json` for
// machine-readable output.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const activeDir = path.join(repoRoot, "tasks/_active");

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
  const lines = text.split("\n");
  const tm = lines[0]?.match(/^#\s+(T\d+|T-[A-Za-z0-9_-]+)\s+—\s+(.+?)\s*$/);
  if (!tm) return null;
  const out = { id: tm[1], title: tm[2] };
  for (const line of lines.slice(1, 12)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s+(.*)$/);
    if (!m) continue;
    out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

function bump(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function collect() {
  const stats = {
    total: 0,
    byOwner: new Map(),
    byStatus: new Map(),
    byPillar: new Map(),
    unrecognized: [],
  };
  if (!fs.existsSync(activeDir)) return stats;
  for (const filename of fs.readdirSync(activeDir).sort()) {
    if (!filename.endsWith(".md")) continue;
    if (filename === "README.md") continue;
    const text = fs.readFileSync(path.join(activeDir, filename), "utf8");
    const front = parseYamlFrontMatter(text) || parseLegacyHeader(text);
    if (!front) {
      stats.unrecognized.push(filename);
      continue;
    }
    stats.total += 1;
    bump(stats.byOwner, front.owner);
    bump(stats.byStatus, front.status);
    bump(stats.byPillar, front.pillar);
  }
  return stats;
}

function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function toJson(stats) {
  const obj = {
    total: stats.total,
    byOwner: Object.fromEntries(sortedEntries(stats.byOwner)),
    byStatus: Object.fromEntries(sortedEntries(stats.byStatus)),
    byPillar: Object.fromEntries(sortedEntries(stats.byPillar)),
    unrecognized: stats.unrecognized,
  };
  return JSON.stringify(obj, null, 2);
}

function toText(stats) {
  const lines = [];
  lines.push(`tasks_active_stats: ${stats.total} task file(s)`);
  for (const [label, map] of [["owner", stats.byOwner], ["status", stats.byStatus], ["pillar", stats.byPillar]]) {
    lines.push("");
    lines.push(`by ${label}:`);
    for (const [k, v] of sortedEntries(map)) {
      lines.push(`  ${v.toString().padStart(4)}  ${k}`);
    }
  }
  if (stats.unrecognized.length > 0) {
    lines.push("");
    lines.push(`unrecognized (${stats.unrecognized.length}):`);
    for (const f of stats.unrecognized) lines.push(`  - ${f}`);
  }
  return lines.join("\n");
}

const args = process.argv.slice(2);
const stats = collect();
if (args.includes("--json")) {
  console.log(toJson(stats));
} else {
  console.log(toText(stats));
}
