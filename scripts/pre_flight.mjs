#!/usr/bin/env node
//
// scripts/pre_flight.mjs
//
// One-shot self-check Claude runs BEFORE opening a PR. Catches the
// recurring classes of review feedback locally so they don't cost
// a full review cycle to surface and clear.
//
// Sits alongside the existing per-domain checks
// (tasks_active_frontmatter_eval, tasks_sync_check,
// coordination_state validate, decisions_queue_lint). Adds the
// code-pattern checks that Codex's recent reviews kept surfacing:
//
//   - route reads req.body without its own express.json
//   - middleware uses next(new Error(...)) for a 413/400
//   - exported all-caps constants not Object.freeze'd
//   - console.log in backend/lib/* (production code path)
//   - eval files without a determinism/idempotency check
//   - route response envelopes that look versioned but omit schemaVersion
//
// Default mode prints findings + exits 0. `--strict` exits 1 on
// any finding. Run from repo root.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const findings = [];
function add(category, file, line, message) {
  findings.push({ category, file, line, message });
}

function walkFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, predicate, out);
    else if (entry.isFile() && predicate(p)) out.push(p);
  }
  return out;
}

// ---------- code-pattern checks ----------

function checkRouteJsonParsers() {
  // For every backend/lib/*_route.js that references req.body, the
  // same file must mount its own express.json() middleware on the
  // route. Surfaced by Codex review on #90.
  const files = walkFiles(
    path.join(repoRoot, "backend", "lib"),
    (p) => p.endsWith("_route.js"),
  );
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (!/\breq\.body\b/.test(text)) continue;
    const mountsJson = /express\.json\s*\(/.test(text)
      || /express\.urlencoded\s*\(/.test(text)
      // Some routes intentionally read the raw body via req.on('data').
      // If they do AND don't reference req.body for parsed JSON access,
      // they're fine. Heuristic: the route is OK if every req.body
      // mention is gated by a `req.body = ...` assignment from the
      // route's own body-reader.
      || /req\.on\(\s*["']data["']/.test(text);
    if (!mountsJson) {
      add(
        "route-needs-own-parser",
        path.relative(repoRoot, f),
        null,
        "route references req.body without mounting its own express.json() or a route-local body reader (Codex #90)",
      );
    }
  }
}

function checkRouteErrorEscapes() {
  // next(new Error("payload_too_large")) escapes to Express's
  // default handler and serves HTML instead of structured JSON.
  // Surfaced by Codex review on #87.
  const files = walkFiles(
    path.join(repoRoot, "backend", "lib"),
    (p) => p.endsWith("_route.js"),
  );
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (/\bnext\s*\(\s*new\s+Error\b/.test(lines[i])) {
        add(
          "middleware-error-escapes",
          path.relative(repoRoot, f),
          i + 1,
          "next(new Error(...)) escapes to Express's default error handler; respond directly with res.status(...).json(...) (Codex #87)",
        );
      }
    }
  }
}

function checkFrozenExportedConstants() {
  // Exported ALL_CAPS constants representing canonical sets / maps
  // must be Object.freeze'd. Surfaced by Codex review on multiple
  // canon evals (#160, #161, #163, #164).
  const files = walkFiles(
    path.join(repoRoot, "backend", "lib"),
    (p) => p.endsWith(".js"),
  );
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      // Match `const NAME = [...]` or `const NAME = {...}` where NAME is
      // ALL_CAPS_WITH_UNDERSCORES and the next chars are an array/object
      // literal (not Object.freeze).
      const m = lines[i].match(/^const\s+([A-Z][A-Z0-9_]+)\s*=\s*([\[{])/);
      if (!m) continue;
      const name = m[1];
      // Heuristic: skip if line clearly says Object.freeze.
      if (/Object\.freeze/.test(lines[i])) continue;
      // Skip if any of the surrounding ±2 lines mention Object.freeze
      // (multi-line declarations).
      const window = lines.slice(Math.max(0, i - 2), i + 3).join("\n");
      if (/Object\.freeze/.test(window)) continue;
      // Skip private (lowercase) — they're not exported.
      // Skip if the file doesn't actually export the name.
      if (!new RegExp(`\\b${name}\\b`).test(text.match(/export\s+\{[\s\S]*?\}/)?.[0] || "")
          && !new RegExp(`export\\s+\\{[^}]*\\b${name}\\b`).test(text)) {
        continue;
      }
      add(
        "exported-const-not-frozen",
        path.relative(repoRoot, f),
        i + 1,
        `exported constant ${name} is not Object.freeze'd (canon-eval class — Codex #160/#161/#163/#164)`,
      );
    }
  }
}

function checkConsoleLogInProductionLib() {
  // console.log in backend/lib/* leaks to deploy logs. console.error
  // and console.warn are OK (intentional). Tests + evals are
  // excluded.
  const files = walkFiles(
    path.join(repoRoot, "backend", "lib"),
    (p) => p.endsWith(".js"),
  );
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      // Match console.log( specifically — not console.error / warn.
      if (/\bconsole\.log\s*\(/.test(lines[i])) {
        add(
          "console-log-in-lib",
          path.relative(repoRoot, f),
          i + 1,
          "console.log in production code path; use console.error/warn for diagnostics or remove",
        );
      }
    }
  }
}

function checkEvalDeterminismCoverage() {
  // Recent canon evals caught shape regressions but missed "same input
  // produces same output" checks. This is heuristic by design: any
  // backend/evals/* file should mention determinism/idempotency/repeatability
  // unless it is explicitly a load/nightly/gate runner.
  const files = walkFiles(
    path.join(repoRoot, "backend", "evals"),
    (p) => /run_.*eval\.mjs$/.test(path.basename(p)),
  );
  for (const f of files) {
    const base = path.basename(f);
    if (/gate|nightly|load|smoke/i.test(base)) continue;
    const text = fs.readFileSync(f, "utf8");
    if (/\b(determinism|deterministic|idempotent|repeatable|same input|same-input|stable output)\b/i.test(text)) {
      continue;
    }
    add(
      "eval-missing-determinism-check",
      path.relative(repoRoot, f),
      null,
      "eval does not appear to assert determinism/idempotency; add a same-input/same-output check or document why it is not deterministic",
    );
  }
}

function checkMountRequiredDepsGuard() {
  // Every `function mount<X>Route(app, deps = {})` must validate its
  // required deps at mount time so a wiring mistake fails LOUD at
  // startup, not on the first request. The decomposition pattern
  // established by Phase 0 (#183) and refined through Phase 2b (#197)
  // makes this a load-bearing contract: dozens of deps per mount,
  // any missing one would silently break the route otherwise.
  //
  // Heuristic: any backend/lib/*.js file that defines a `function
  // mount<Name>` (or `function mount<Name>Route`) and references
  // `deps` or destructures from a function parameter must also
  // contain a guard clause that throws on missing deps. Acceptable
  // guard patterns:
  //
  //   if (typeof <name> !== "function") throw new Error(...)
  //   if (!<name> || typeof <name>.<method> !== "function") throw ...
  //   for ([, fn] of Object.entries(requiredFns)) if (typeof fn !== "function") throw ...
  //
  // Files that don't define a `mount<X>` function are skipped.
  const files = walkFiles(
    path.join(repoRoot, "backend", "lib"),
    (p) => p.endsWith(".js"),
  );
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const mountMatch = text.match(/function\s+(mount[A-Z][A-Za-z0-9_]*)\s*\(/);
    if (!mountMatch) continue;
    // The function must accept deps in some form (object destructure
    // or a `deps` parameter) — otherwise there's nothing to guard.
    if (!/\bdeps\b/.test(text)) continue;
    // Acceptable guards inside the file:
    const hasThrowGuard = /throw\s+new\s+Error\s*\([^)]*requires?\b/i.test(text)
      || /throw\s+new\s+Error\s*\([^)]*is required\b/i.test(text);
    if (!hasThrowGuard) {
      add(
        "mount-missing-required-deps-guard",
        path.relative(repoRoot, f),
        null,
        `${mountMatch[1]} appears to accept deps but does not throw on a missing required dep; add a guard so wiring mistakes fail loud at startup`,
      );
    }
  }
}

function checkSchemaVersionedEnvelopes() {
  // App-facing list/report envelopes should carry schemaVersion so iOS can
  // decode defensively. Keep this conservative: only flag route files that
  // return JSON objects with envelope-looking keys and no schemaVersion or
  // legacy schema_version anywhere in the file.
  const files = walkFiles(
    path.join(repoRoot, "backend", "lib"),
    (p) => p.endsWith("_route.js"),
  );
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (/\bschemaVersion\b|\bschema_version\b/.test(text)) continue;
    if (!/\b(res\.json|\.json)\s*\(\s*\{/.test(text)) continue;
    if (!/\b(entries|items|results|counts|features|suggestions|report|summary)\s*:/.test(text)) continue;
    add(
      "schema-envelope-missing-version",
      path.relative(repoRoot, f),
      null,
      "route returns an envelope-like JSON object without schemaVersion/schema_version; add a version field or document why this response is unversioned",
    );
  }
}

// ---------- orchestration ----------

checkRouteJsonParsers();
checkRouteErrorEscapes();
checkFrozenExportedConstants();
checkConsoleLogInProductionLib();
checkEvalDeterminismCoverage();
checkSchemaVersionedEnvelopes();
checkMountRequiredDepsGuard();

const strict = process.argv.includes("--strict");

if (findings.length === 0) {
  console.log("pre-flight: OK (no findings)");
  process.exit(0);
}

console.error(`pre-flight: ${findings.length} finding(s)${strict ? " — FAILING (--strict)" : " — warn-only (re-run with --strict to fail)"}`);
// Group by category for readable output.
const byCategory = new Map();
for (const f of findings) {
  if (!byCategory.has(f.category)) byCategory.set(f.category, []);
  byCategory.get(f.category).push(f);
}
for (const [category, list] of [...byCategory.entries()].sort()) {
  console.error("");
  console.error(`[${category}] (${list.length})`);
  for (const f of list) {
    const loc = f.line === null ? f.file : `${f.file}:${f.line}`;
    console.error(`  ${loc}`);
    console.error(`    ${f.message}`);
  }
}

if (strict) process.exit(1);
process.exit(0);
