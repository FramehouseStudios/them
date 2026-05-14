#!/usr/bin/env node
//
// scripts/audit_inline_routes.mjs
//
// Lists every `app.get/post/put/delete/patch/all(...)` still inline
// in `backend/index.js` so the next decomposition phase can be
// chosen by call frequency, not by guessing.
//
// Two categories are kept SEPARATE: live route handlers vs.
// `app.all(..., methodNotAllowed(...))` 405-handler catches. A
// `/auth/login` row with 1 live POST + 1 method-guard catch is
// reported as 1 live, not 2 inline routes. Method-guards belong in
// the decomposition target's lib but they are not inline route
// handlers; conflating them inflates the remaining-work estimate
// and misdirects the next phase.
//
// Output: a markdown table grouped by route prefix, sorted by
// live-route count descending. Method-guard counts appear in their
// own column and are excluded from the live total.
//
// Pass `--json` for a machine-readable summary. Run from repo root.

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

// Match every `app.<method>("/...` at line start.
const ROUTE_RE = /^app\.(get|post|put|delete|patch|all)\s*\(\s*["']([^"']+)["']/;

const liveRoutes = [];
const methodGuards = [];
for (let i = 0; i < lines.length; i += 1) {
  const m = lines[i].match(ROUTE_RE);
  if (!m) continue;
  const method = m[1].toUpperCase();
  const routePath = m[2];
  const line = lines[i];
  // Distinguish methodNotAllowed catches from real handlers.
  // The pattern is `app.all("/...", methodNotAllowed("..."))` —
  // app.all + the methodNotAllowed handler in the same statement.
  const isMethodGuard = method === "ALL" && /methodNotAllowed\s*\(/.test(line);
  const entry = { line: i + 1, method, path: routePath };
  if (isMethodGuard) methodGuards.push(entry);
  else liveRoutes.push(entry);
}

function prefixOf(p) {
  const trimmed = p.replace(/^\//, "");
  const slash = trimmed.indexOf("/");
  if (slash === -1) return `/${trimmed}` || "/";
  return `/${trimmed.slice(0, slash)}`;
}

const byPrefix = new Map();
for (const r of liveRoutes) {
  const pfx = prefixOf(r.path);
  if (!byPrefix.has(pfx)) byPrefix.set(pfx, { live: [], guards: [] });
  byPrefix.get(pfx).live.push(r);
}
for (const r of methodGuards) {
  const pfx = prefixOf(r.path);
  if (!byPrefix.has(pfx)) byPrefix.set(pfx, { live: [], guards: [] });
  byPrefix.get(pfx).guards.push(r);
}

const summary = [...byPrefix.entries()]
  .map(([prefix, group]) => ({
    prefix,
    liveCount: group.live.length,
    guardCount: group.guards.length,
    live: group.live,
    guards: group.guards,
  }))
  .sort((a, b) => {
    // Live count desc; ties broken by guard count desc.
    if (b.liveCount !== a.liveCount) return b.liveCount - a.liveCount;
    return b.guardCount - a.guardCount;
  });

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    indexLineCount: lines.length,
    liveInlineRoutes: liveRoutes.length,
    methodGuards: methodGuards.length,
    byPrefix: summary,
  }, null, 2));
  process.exit(0);
}

console.log(`backend/index.js: ${lines.length.toLocaleString()} lines`);
console.log(`  Live inline route handlers: ${liveRoutes.length}`);
console.log(`  Method-guard (app.all + methodNotAllowed) catches: ${methodGuards.length}`);
console.log("");
console.log("Live inline route handlers by prefix (descending):\n");
console.log("| Prefix | Live | Method-guards | Example |");
console.log("| --- | --- | --- | --- |");
for (const group of summary) {
  const example = group.live[0] || group.guards[0];
  const tag = example ? `\`${example.method} ${example.path}\` (L${example.line})` : "—";
  console.log(`| \`${group.prefix}\` | ${group.liveCount} | ${group.guardCount} | ${tag} |`);
}
console.log("\nFull listing (live routes only; method-guards listed separately at bottom):\n");
for (const group of summary) {
  if (group.live.length === 0) continue;
  console.log(`### ${group.prefix} (${group.liveCount} live)`);
  for (const r of group.live) {
    console.log(`  - L${r.line}: ${r.method} ${r.path}`);
  }
  console.log("");
}
if (methodGuards.length > 0) {
  console.log("Method-guards (405-handler catches):\n");
  for (const group of summary) {
    if (group.guards.length === 0) continue;
    console.log(`### ${group.prefix} method-guards (${group.guardCount})`);
    for (const r of group.guards) {
      console.log(`  - L${r.line}: ${r.method} ${r.path} (methodNotAllowed)`);
    }
    console.log("");
  }
}
