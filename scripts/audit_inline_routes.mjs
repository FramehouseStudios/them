#!/usr/bin/env node
//
// scripts/audit_inline_routes.mjs
//
// Lists every non-guard `app.get/post/put/delete(...)` still inline
// in `backend/index.js` so the next decomposition phase can be chosen
// by call frequency, not by guessing.
//
// Output: a markdown table grouped by route prefix, sorted by
// inline count descending. Useful for prioritizing Phases 5–8.
//
// Default: prints to stdout. Pass `--json` to emit a machine-readable
// summary. `app.all(...)` method-not-allowed guards are counted in a
// separate section; pass `--include-method-guards` to include them in
// the main priority table. Run from repo root.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "backend", "index.js");

if (!fs.existsSync(indexPath)) {
  console.error(`audit_inline_routes: ${indexPath} not found`);
  process.exit(2);
}

const text = fs.readFileSync(indexPath, "utf8");
const lines = text.split("\n");
const includeMethodGuards = process.argv.includes("--include-method-guards");

// Match every `app.get("/...` / `app.post("/..."` etc at line start.
const ROUTE_RE = /^app\.(get|post|put|delete|patch|all)\s*\(\s*["']([^"']+)["']/;

const routes = [];
const methodGuards = [];
for (let i = 0; i < lines.length; i += 1) {
  const m = lines[i].match(ROUTE_RE);
  if (!m) continue;
  const route = {
    line: i + 1,
    method: m[1].toUpperCase(),
    path: m[2],
  };
  if (route.method === "ALL") {
    methodGuards.push(route);
    if (!includeMethodGuards) continue;
  }
  routes.push(route);
}

// Group by top-level path prefix (e.g. /talk, /screenplay, /auth).
function prefixOf(p) {
  // Strip leading slash, take first segment.
  const trimmed = p.replace(/^\//, "");
  const slash = trimmed.indexOf("/");
  if (slash === -1) return `/${trimmed}` || "/";
  return `/${trimmed.slice(0, slash)}`;
}

const byPrefix = new Map();
for (const r of routes) {
  const pfx = prefixOf(r.path);
  if (!byPrefix.has(pfx)) byPrefix.set(pfx, []);
  byPrefix.get(pfx).push(r);
}

const summary = [...byPrefix.entries()]
  .map(([prefix, list]) => ({ prefix, count: list.length, routes: list }))
  .sort((a, b) => b.count - a.count);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    indexLineCount: lines.length,
    totalInlineRoutes: routes.length,
    totalMethodGuards: methodGuards.length,
    includeMethodGuards,
    byPrefix: summary,
    methodGuards,
  }, null, 2));
  process.exit(0);
}

const guardNote = includeMethodGuards
  ? `including ${methodGuards.length} app.all method guards`
  : `excluding ${methodGuards.length} app.all method guards`;
console.log(`backend/index.js: ${lines.length.toLocaleString()} lines, ${routes.length} inline live routes (${guardNote})\n`);
console.log("Inline-route counts by prefix (descending):\n");
console.log("| Prefix | Inline count | Example route |");
console.log("| --- | --- | --- |");
for (const group of summary) {
  const example = group.routes[0];
  console.log(`| \`${group.prefix}\` | ${group.count} | \`${example.method} ${example.path}\` (line ${example.line}) |`);
}
console.log("\nFull listing:\n");
for (const group of summary) {
  console.log(`### ${group.prefix} (${group.count})`);
  for (const r of group.routes) {
    console.log(`  - L${r.line}: ${r.method} ${r.path}`);
  }
  console.log("");
}

if (!includeMethodGuards && methodGuards.length > 0) {
  console.log("Method guards excluded from priority table:\n");
  for (const r of methodGuards) {
    console.log(`  - L${r.line}: ${r.method} ${r.path}`);
  }
  console.log("");
}
