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

function checkLibHasTest() {
  // Every backend/lib/*.js should have a corresponding test. A test
  // can be:
  //
  //   1. A direct `backend/tests/<name>.test.mjs` file.
  //   2. Some other test file that imports `lib/<name>.js`.
  //
  // Files can explicitly opt out by including the marker comment
  // `// pre-flight: no-test-needed` at the top of the file (for
  // pure-config or pure-constants modules).
  //
  // This rule is the static-analysis cousin of the round-19
  // test-coverage audit. The audit found 7 untested libs;
  // T-untested-libs-followups tracked the gap. Once that follow-up
  // closes, this rule should produce zero findings on main.
  const libDir = path.join(repoRoot, "backend", "lib");
  const testDir = path.join(repoRoot, "backend", "tests");
  if (!fs.existsSync(libDir) || !fs.existsSync(testDir)) return;
  const libFiles = walkFiles(libDir, (p) => p.endsWith(".js"));
  const testFiles = walkFiles(testDir, (p) => p.endsWith(".test.mjs"));
  // Build an import index once: map each lib path → bool seen in tests.
  const testTexts = testFiles.map((f) => ({ path: f, text: fs.readFileSync(f, "utf8") }));
  for (const libFile of libFiles) {
    const libBase = path.basename(libFile, ".js");
    const libText = fs.readFileSync(libFile, "utf8");
    // Opt-out marker.
    if (/\/\/\s*pre-flight\s*:\s*no-test-needed/i.test(libText)) continue;
    // Direct test file?
    const directTest = path.join(testDir, `${libBase}.test.mjs`);
    if (fs.existsSync(directTest)) continue;
    // Indirect coverage via any test that imports `lib/<base>.js`?
    const importPattern = new RegExp(`from\\s+["'][^"']*lib/${libBase}\\.js["']`);
    const importedSomewhere = testTexts.some((t) => importPattern.test(t.text));
    if (importedSomewhere) continue;
    add(
      "lib-missing-test",
      path.relative(repoRoot, libFile),
      null,
      `backend/lib/${libBase}.js has no direct test (${libBase}.test.mjs) and is not imported by any test file. Add a test or mark "// pre-flight: no-test-needed" if the file is pure config.`,
    );
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

function extractMarkdownSchemaTerms(text) {
  const terms = new Set();
  for (const match of text.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g)) {
    terms.add(match[1]);
  }
  for (const match of text.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)) {
    terms.add(match[1]);
  }
  for (const match of text.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)) {
    terms.add(match[1]);
  }
  return terms;
}

function checkSchemaDocBackendDrift() {
  // Schema docs are only useful if they match the canonical backend
  // code. Keep this check intentionally narrow and source-backed:
  // the outbox record drift in schema-doc batch 3 used legacy
  // snake_case fields/statuses while backend/lib/outbox_store.js
  // has used camelCase + pending/completed/failed.
  const outboxDoc = path.join(repoRoot, "docs", "schemas", "outbox-event.md");
  const outboxSource = path.join(repoRoot, "backend", "lib", "outbox_store.js");
  if (!fs.existsSync(outboxDoc) || !fs.existsSync(outboxSource)) return;
  const docText = fs.readFileSync(outboxDoc, "utf8");
  const sourceText = fs.readFileSync(outboxSource, "utf8");
  const terms = extractMarkdownSchemaTerms(docText);

  const canonicalFields = [
    "id",
    "type",
    "actionKey",
    "status",
    "attempts",
    "createdAt",
    "updatedAt",
    "nextAttemptAt",
    "payload",
    "result",
    "lastError",
  ];
  const canonicalStatuses = ["pending", "completed", "failed"];
  const staleTerms = [
    "kind",
    "created_at",
    "next_attempt_at",
    "last_error",
    "completed_at",
    "in_flight",
    "succeeded",
    "failed_permanent",
  ];

  const sourceHasCanonicalShape = canonicalFields.every((field) => sourceText.includes(field))
    && canonicalStatuses.every((status) => sourceText.includes(`"${status}"`));
  if (!sourceHasCanonicalShape) return;

  const foundStaleTerms = staleTerms.filter((term) => terms.has(term));
  if (foundStaleTerms.length > 0) {
    add(
      "schema-doc-backend-drift",
      path.relative(repoRoot, outboxDoc),
      null,
      `outbox schema doc uses stale field/status terms not present in the canonical store shape: ${foundStaleTerms.join(", ")}. Match backend/lib/outbox_store.js before review.`,
    );
  }

  const missingFields = canonicalFields.filter((field) => !terms.has(field));
  const missingStatuses = canonicalStatuses.filter((status) => !terms.has(status));
  if (missingFields.length > 0 || missingStatuses.length > 0) {
    add(
      "schema-doc-backend-drift",
      path.relative(repoRoot, outboxDoc),
      null,
      `outbox schema doc is missing canonical store terms: ${[...missingFields, ...missingStatuses].join(", ")}. Match backend/lib/outbox_store.js before review.`,
    );
  }
}

function checkTaskV1Pillar() {
  // Every active task file in tasks/_active/T-*.md that uses YAML
  // front matter should carry a v1_pillar + v1_effect declaration
  // per docs/v1-definition.md's "PR Rule".
  //
  // Grandfather rules (skip the check):
  //   - Files without YAML front matter (pre-V1-doc style).
  //   - Coord-refresh task files (predate the V1 rule).
  //
  // Acceptable forms:
  //   - YAML front matter: `v1_pillar: <talk|screenplay|memory|realtime|ios|infra>`
  //     plus `v1_effect: <one-liner>`
  //   - Body line `V1 pillar: <pillar>` plus `V1 effect: ...`
  //
  // Warn-only by default. --strict makes the rule fail the run.
  const activeDir = path.join(repoRoot, "tasks", "_active");
  if (!fs.existsSync(activeDir)) return;
  const files = walkFiles(activeDir, (p) => p.endsWith(".md") && path.basename(p).startsWith("T-"));
  const validPillars = new Set(["talk", "screenplay", "memory", "realtime", "ios", "infra"]);
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    // Grandfather: only flag files with YAML front matter (new
    // task-file shape established after the V1 rule).
    if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) continue;
    // Grandfather coord-refresh tasks even if they have front matter.
    if (/Refresh coordination after PR/i.test(text)) continue;
    // Grandfather already-merged tasks: the V1 rule landed
    // 2026-05-13 (docs/v1-definition.md). Anything `status: merged`
    // shipped before the rule could apply.
    if (/^status:\s*merged\s*$/im.test(text)) continue;
    const hasYamlPillar = /^v1_pillar:\s*(\S+)/m.test(text);
    const hasYamlEffect = /^v1_effect:\s*\S/m.test(text);
    const hasBodyPillar = /V1\s+pillar:\s*(\S+)/i.test(text);
    const hasBodyEffect = /V1\s+effect:\s*\S/i.test(text);
    const hasPillar = hasYamlPillar || hasBodyPillar;
    const hasEffect = hasYamlEffect || hasBodyEffect;
    if (!hasPillar && !hasEffect) {
      add(
        "task-missing-v1-pillar",
        path.relative(repoRoot, f),
        null,
        `task file is missing both v1_pillar and v1_effect declarations. Add ${"`"}V1 pillar: <talk|screenplay|memory|realtime|ios|infra>${"`"} and ${"`"}V1 effect: <effect>${"`"} per docs/v1-definition.md.`,
      );
      continue;
    }
    if (hasPillar) {
      const m = text.match(/^v1_pillar:\s*(\S+)/m) || text.match(/V1\s+pillar:\s*(\S+)/i);
      const pillar = (m?.[1] || "").trim().toLowerCase();
      if (pillar && !validPillars.has(pillar)) {
        add(
          "task-invalid-v1-pillar",
          path.relative(repoRoot, f),
          null,
          `v1_pillar "${pillar}" is not one of: ${[...validPillars].join(", ")}.`,
        );
      }
    }
  }
}

function checkTaskIdMatchesFilename() {
  // Every active task file in tasks/_active/T-*.md that uses YAML
  // front matter and declares an `id:` field must have the id
  // match the file's basename (without .md). Mismatched ids break
  // cross-references in coordination.json / claude-inbox /
  // sibling task files silently.
  const activeDir = path.join(repoRoot, "tasks", "_active");
  if (!fs.existsSync(activeDir)) return;
  const files = walkFiles(activeDir, (p) => p.endsWith(".md") && path.basename(p).startsWith("T-"));
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) continue;
    const m = text.match(/^id:\s*(\S+)/m);
    if (!m) continue;
    const declaredId = (m[1] || "").trim();
    const filenameId = path.basename(f, ".md");
    if (declaredId !== filenameId) {
      add(
        "task-id-mismatch-filename",
        path.relative(repoRoot, f),
        null,
        `task file id "${declaredId}" does not match filename "${filenameId}". Cross-references in coordination.json or other task files would break silently. Either rename the file or update the id field.`,
      );
    }
  }
}

function checkTaskStatusVocabulary() {
  // Every active task file in tasks/_active/ that uses YAML
  // front matter must declare a `status:` field, and that field
  // must be one of the canonical or grandfathered values:
  //   ready | ready-for-claude | in-progress | review | merged |
  //   planned | open | blocked | parked | closed | draft
  //
  // File scope: any task file matching T<-or-digit>...
  //   - T- prefix (Claude-style): T-foo, T-bar
  //   - T<digit> prefix (Codex-style): T48, T85
  // Both lanes are audited so the canonical status vocabulary
  // is enforced across the whole repo. The original draft of
  // this rule used startsWith("T-") which silently skipped 50
  // Codex-numbered task files; the audit caught the gap.
  //
  // Grandfather: files without YAML front matter are pre-V1-rule.
  // Same exception list as checkTaskV1Pillar (coord-refresh, etc.).
  //
  // This is determinism for status reporting — coord-refresh and the
  // v1_status reporter both key on status to decide what to show.
  // A typo (e.g. "shipped" instead of "merged") silently drops the
  // task from rollups.
  const activeDir = path.join(repoRoot, "tasks", "_active");
  if (!fs.existsSync(activeDir)) return;
  // Canonical set follows AGENTS.md/TASKS.md for the live workflow
  // and keeps a few grandfathered coordination statuses so the rule
  // catches typos without forcing an unrelated task-file migration.
  const validStatuses = new Set([
    "ready",
    "ready-for-claude",
    "in-progress",
    "review",
    "merged",
    "planned",
    "open",
    "blocked",
    "parked",
    "closed",
    "draft",
  ]);
  const files = walkFiles(activeDir, (p) => {
    if (!p.endsWith(".md")) return false;
    const base = path.basename(p);
    return base.startsWith("T-") || /^T\d/.test(base);
  });
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) continue;
    if (/Refresh coordination after PR/i.test(text)) continue;
    const m = text.match(/^status:\s*(\S+)/m);
    if (!m) {
      add(
        "task-missing-status",
        path.relative(repoRoot, f),
        null,
        `task file YAML front matter is missing a ${"`"}status:${"`"} field. Add one of: ${[...validStatuses].join(", ")}.`,
      );
      continue;
    }
    const status = (m[1] || "").trim().toLowerCase();
    if (!validStatuses.has(status)) {
      add(
        "task-invalid-status",
        path.relative(repoRoot, f),
        null,
        `status "${status}" is not one of: ${[...validStatuses].join(", ")}. Typos silently drop the task from status rollups.`,
      );
    }
  }
}

// ---------- orchestration ----------

checkRouteJsonParsers();
checkRouteErrorEscapes();
checkFrozenExportedConstants();
checkConsoleLogInProductionLib();
checkEvalDeterminismCoverage();
checkSchemaVersionedEnvelopes();
checkSchemaDocBackendDrift();
checkMountRequiredDepsGuard();
checkLibHasTest();
checkTaskV1Pillar();
checkTaskIdMatchesFilename();
checkTaskStatusVocabulary();

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
