// T-pre-flight-self-check-script — smoke + fixture tests for the
// pre-flight checks. The fixture tests use temp dirs so we can
// exercise each finding class without depending on (or polluting)
// real main-line code.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const script = path.resolve(__dirname, "pre_flight.mjs");

function tempRepo({
  withRouteFile,
  withConstantFile,
  withMiddlewareFile,
  withConsoleLogFile,
  withEvalFile,
  withEnvelopeRouteFile,
  withMountFile,
  withOutboxSource,
  withOutboxDoc,
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-preflight-"));
  fs.mkdirSync(path.join(tmp, "scripts"));
  fs.mkdirSync(path.join(tmp, "backend", "lib"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "backend", "tests"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "backend", "evals"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "docs", "schemas"), { recursive: true });
  fs.copyFileSync(script, path.join(tmp, "scripts", "pre_flight.mjs"));
  if (withRouteFile) {
    fs.writeFileSync(path.join(tmp, "backend", "lib", "thing_route.js"), withRouteFile);
  }
  if (withMiddlewareFile) {
    fs.writeFileSync(path.join(tmp, "backend", "lib", "middleware_route.js"), withMiddlewareFile);
  }
  if (withConstantFile) {
    fs.writeFileSync(path.join(tmp, "backend", "lib", "constants_lib.js"), withConstantFile);
  }
  if (withConsoleLogFile) {
    fs.writeFileSync(path.join(tmp, "backend", "lib", "noisy_lib.js"), withConsoleLogFile);
  }
  if (withEvalFile) {
    fs.writeFileSync(path.join(tmp, "backend", "evals", "run_sample_eval.mjs"), withEvalFile);
  }
  if (withEnvelopeRouteFile) {
    fs.writeFileSync(path.join(tmp, "backend", "lib", "envelope_route.js"), withEnvelopeRouteFile);
  }
  if (withMountFile) {
    fs.writeFileSync(path.join(tmp, "backend", "lib", "mountable_lib.js"), withMountFile);
  }
  if (withOutboxSource) {
    fs.writeFileSync(path.join(tmp, "backend", "lib", "outbox_store.js"), withOutboxSource);
  }
  if (withOutboxDoc) {
    fs.writeFileSync(path.join(tmp, "docs", "schemas", "outbox-event.md"), withOutboxDoc);
  }
  return tmp;
}

function writeTaskFile(tmp, name, body) {
  fs.mkdirSync(path.join(tmp, "tasks", "_active"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "tasks", "_active", name), body);
}

function runIn(tmp, extraArgs = []) {
  return spawnSync("node", [path.join(tmp, "scripts", "pre_flight.mjs"), ...extraArgs], { encoding: "utf8" });
}

// ---------- empty repo path ----------

test("[pre-flight] clean repo with no lib/ → exit 0, no findings", () => {
  const tmp = tempRepo();
  const r = runIn(tmp);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /pre-flight: OK/);
});

// ---------- route-needs-own-parser ----------

test("[pre-flight] flags route that reads req.body without express.json", () => {
  const route = `
import express from "express";
function mountFoo(app) {
  app.post("/foo", (req, res) => {
    const x = req.body.x;
    return res.json({ x });
  });
}
export { mountFoo };
`;
  const tmp = tempRepo({ withRouteFile: route });
  const r = runIn(tmp);
  assert.equal(r.status, 0); // warn-only
  assert.match(r.stderr, /route-needs-own-parser/);
  assert.match(r.stderr, /thing_route\.js/);
});

test("[pre-flight] route with route-local express.json is NOT flagged", () => {
  const route = `
import express from "express";
function mountFoo(app) {
  app.post("/foo", express.json({ limit: "2mb" }), (req, res) => {
    const x = req.body.x;
    return res.json({ x });
  });
}
export { mountFoo };
`;
  const tmp = tempRepo({ withRouteFile: route });
  const r = runIn(tmp);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stderr, /route-needs-own-parser/);
});

test("[pre-flight] route with raw body reader (req.on data) is NOT flagged", () => {
  const route = `
function mountFoo(app) {
  app.post("/foo", (req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      req.body = Buffer.concat(chunks).toString("utf8");
      return res.json({ ok: true });
    });
  });
}
export { mountFoo };
`;
  const tmp = tempRepo({ withRouteFile: route });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /route-needs-own-parser/);
});

// ---------- middleware-error-escapes ----------

test("[pre-flight] flags next(new Error(...)) in route middleware", () => {
  const middleware = `
function mountFoo(app) {
  app.post("/foo", (req, _res, next) => {
    if (Number(req.headers["content-length"]) > 4_000_000) {
      return next(new Error("payload_too_large"));
    }
    return next();
  });
}
export { mountFoo };
`;
  const tmp = tempRepo({ withMiddlewareFile: middleware });
  const r = runIn(tmp);
  assert.match(r.stderr, /middleware-error-escapes/);
  assert.match(r.stderr, /middleware_route\.js/);
});

test("[pre-flight] direct res.status().json() is NOT flagged", () => {
  const middleware = `
function mountFoo(app) {
  app.post("/foo", (req, res, next) => {
    if (Number(req.headers["content-length"]) > 4_000_000) {
      return res.status(413).json({ error: "payload_too_large" });
    }
    return next();
  });
}
export { mountFoo };
`;
  const tmp = tempRepo({ withMiddlewareFile: middleware });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /middleware-error-escapes/);
});

// ---------- exported-const-not-frozen ----------

test("[pre-flight] flags exported ALL_CAPS array without Object.freeze", () => {
  const lib = `
const ALLOWED_KINDS = [
  "alpha",
  "beta",
];
export { ALLOWED_KINDS };
`;
  const tmp = tempRepo({ withConstantFile: lib });
  const r = runIn(tmp);
  assert.match(r.stderr, /exported-const-not-frozen/);
  assert.match(r.stderr, /ALLOWED_KINDS/);
});

test("[pre-flight] Object.freeze'd export is NOT flagged", () => {
  const lib = `
const ALLOWED_KINDS = Object.freeze([
  "alpha",
  "beta",
]);
export { ALLOWED_KINDS };
`;
  const tmp = tempRepo({ withConstantFile: lib });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /exported-const-not-frozen/);
});

test("[pre-flight] private (non-exported) constants are NOT flagged", () => {
  const lib = `
const PRIVATE_THING = [1, 2, 3];
const EXPORTED_THING = Object.freeze([4, 5, 6]);
function doStuff() { return PRIVATE_THING.length; }
export { doStuff, EXPORTED_THING };
`;
  const tmp = tempRepo({ withConstantFile: lib });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /exported-const-not-frozen/);
});

// ---------- console-log-in-lib ----------

test("[pre-flight] flags console.log in production lib", () => {
  const lib = `
function doWork() {
  console.log("debug stuff");
}
export { doWork };
`;
  const tmp = tempRepo({ withConsoleLogFile: lib });
  const r = runIn(tmp);
  assert.match(r.stderr, /console-log-in-lib/);
  assert.match(r.stderr, /noisy_lib\.js/);
});

test("[pre-flight] console.error / console.warn are NOT flagged", () => {
  const lib = `
function doWork() {
  console.error("real error");
  console.warn("real warning");
}
export { doWork };
`;
  const tmp = tempRepo({ withConsoleLogFile: lib });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /console-log-in-lib/);
});

// ---------- eval-missing-determinism-check ----------

test("[pre-flight] flags eval without a determinism check", () => {
  const evalFile = `
function run() {
  assertShape(buildOutput());
}
run();
`;
  const tmp = tempRepo({ withEvalFile: evalFile });
  const r = runIn(tmp);
  assert.match(r.stderr, /eval-missing-determinism-check/);
  assert.match(r.stderr, /run_sample_eval\.mjs/);
});

test("[pre-flight] eval mentioning deterministic output is NOT flagged", () => {
  const evalFile = `
function run() {
  check("deterministic: same input yields same output", true);
}
run();
`;
  const tmp = tempRepo({ withEvalFile: evalFile });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /eval-missing-determinism-check/);
});

// ---------- schema-envelope-missing-version ----------

test("[pre-flight] flags envelope-like route response without schemaVersion", () => {
  const route = `
function mountFoo(app) {
  app.get("/foo", (_req, res) => {
    return res.json({ entries: [], counts: { total: 0 } });
  });
}
export { mountFoo };
`;
  const tmp = tempRepo({ withEnvelopeRouteFile: route });
  const r = runIn(tmp);
  assert.match(r.stderr, /schema-envelope-missing-version/);
  assert.match(r.stderr, /envelope_route\.js/);
});

test("[pre-flight] schemaVersion envelope is NOT flagged", () => {
  const route = `
function mountFoo(app) {
  app.get("/foo", (_req, res) => {
    return res.json({ schemaVersion: 1, entries: [], counts: { total: 0 } });
  });
}
export { mountFoo };
`;
  const tmp = tempRepo({ withEnvelopeRouteFile: route });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /schema-envelope-missing-version/);
});

// ---------- schema-doc-backend-drift ----------

const canonicalOutboxSource = `
async function enqueueActionOutbox() {
  return {
    id: "ob_1",
    type: "email_compose",
    actionKey: "outbox_email_compose",
    status: "pending",
    attempts: 0,
    createdAt: 1,
    updatedAt: 1,
    nextAttemptAt: 1,
    payload: {},
    result: {},
    lastError: "",
  };
}
async function finish(item) {
  return { status: item.ok ? "completed" : "failed" };
}
export { enqueueActionOutbox, finish };
`;

test("[pre-flight] flags outbox schema docs with stale backend terms", () => {
  const staleDoc = `
# outbox-event schema

\`\`\`json
{
  "id": "ob_1",
  "kind": "email.password_reset",
  "created_at": 1715620920000,
  "attempts": 0,
  "next_attempt_at": 1715620920000,
  "status": "pending",
  "payload": {},
  "last_error": null,
  "completed_at": null
}
\`\`\`

| Key | Type |
| --- | --- |
| \`status\` | \`pending\` | \`in_flight\` | \`succeeded\` | \`failed_permanent\` |
`;
  const tmp = tempRepo({
    withOutboxSource: canonicalOutboxSource,
    withOutboxDoc: staleDoc,
  });
  const r = runIn(tmp);
  assert.match(r.stderr, /schema-doc-backend-drift/);
  assert.match(r.stderr, /kind/);
  assert.match(r.stderr, /created_at/);
  assert.match(r.stderr, /actionKey/);
  assert.match(r.stderr, /completed/);
});

test("[pre-flight] accepts outbox schema docs matching the canonical store shape", () => {
  const currentDoc = `
# outbox-event schema

\`\`\`json
{
  "id": "ob_1",
  "type": "email_compose",
  "actionKey": "outbox_email_compose",
  "status": "pending",
  "attempts": 0,
  "createdAt": 1715620920000,
  "updatedAt": 1715620920000,
  "nextAttemptAt": 1715620920000,
  "payload": {},
  "result": {},
  "lastError": ""
}
\`\`\`

| Key | Type | Notes |
| --- | --- | --- |
| \`id\` | string | row id |
| \`type\` | string | normalized action type |
| \`actionKey\` | string | idempotency key |
| \`status\` | string | \`pending\` | \`completed\` | \`failed\` |
| \`attempts\` | int | retry count |
| \`createdAt\` | int | epoch ms |
| \`updatedAt\` | int | epoch ms |
| \`nextAttemptAt\` | int | epoch ms |
| \`payload\` | object | effect payload |
| \`result\` | object | last result payload |
| \`lastError\` | string | last error summary |
`;
  const tmp = tempRepo({
    withOutboxSource: canonicalOutboxSource,
    withOutboxDoc: currentDoc,
  });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /schema-doc-backend-drift/);
});

// ---------- strict mode ----------

test("[pre-flight] --strict exits 1 when findings exist", () => {
  const route = `
function mountFoo(app) {
  app.post("/foo", (req, res) => { res.json(req.body); });
}
`;
  const tmp = tempRepo({ withRouteFile: route });
  const r = runIn(tmp, ["--strict"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAILING/);
});

test("[pre-flight] --strict exits 0 when clean", () => {
  const tmp = tempRepo();
  const r = runIn(tmp, ["--strict"]);
  assert.equal(r.status, 0);
});

// ---------- real-repo smoke ----------

test("[pre-flight] real repo run completes without crashing", () => {
  // Real run against main — exits 0 in warn mode regardless of
  // findings. We just need this not to throw.
  const r = spawnSync("node", [script], {
    encoding: "utf8",
    cwd: path.resolve(__dirname, ".."),
  });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.length > 0 || r.stderr.length > 0);
});

// ---------- mount-missing-required-deps-guard ----------

test("[pre-flight] flags mount<X> functions that lack a required-deps guard", () => {
  const mountFile = `
// A mount function that accepts deps but never validates them.
function mountThingRoute(app, deps = {}) {
  const { someFn } = deps;
  app.get("/thing", (_req, res) => res.json(someFn()));
}
export { mountThingRoute };
`;
  const tmp = tempRepo({ withMountFile: mountFile });
  const r = runIn(tmp);
  assert.match(r.stderr, /mount-missing-required-deps-guard/);
  assert.match(r.stderr, /mountThingRoute/);
});

test("[pre-flight] accepts mount<X> functions that throw on a missing dep", () => {
  const mountFile = `
function mountThingRoute(app, deps = {}) {
  const { someFn } = deps;
  if (typeof someFn !== "function") {
    throw new Error("mountThingRoute requires someFn");
  }
  app.get("/thing", (_req, res) => res.json(someFn()));
}
export { mountThingRoute };
`;
  const tmp = tempRepo({ withMountFile: mountFile });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /mount-missing-required-deps-guard/);
});

test("[pre-flight] accepts mount<X> functions with bulk Object.entries guard", () => {
  const mountFile = `
function mountThingRoute(app, deps = {}) {
  const { a, b } = deps;
  const required = { a, b };
  for (const [k, fn] of Object.entries(required)) {
    if (typeof fn !== "function") throw new Error(\`mountThingRoute: \${k} is required\`);
  }
  app.get("/thing", (_req, res) => res.json(a(b())));
}
export { mountThingRoute };
`;
  const tmp = tempRepo({ withMountFile: mountFile });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /mount-missing-required-deps-guard/);
});

test("[pre-flight] does not flag lib files without a mount<X> function", () => {
  const libFile = `
// Pure helpers; no mount function, no deps to guard.
function compute(a, b) { return a + b; }
export { compute };
`;
  const tmp = tempRepo({ withMountFile: libFile });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /mount-missing-required-deps-guard/);
});

// ---------- lib-missing-test ----------

test("[pre-flight] flags a lib that has no direct test and is not imported", () => {
  const libFile = `function compute(a, b) { return a + b; }
export { compute };
`;
  // tempRepo writes the mount file under backend/lib/mountable_lib.js.
  // No corresponding mountable_lib.test.mjs is written, so the rule
  // should flag it.
  const tmp = tempRepo({ withMountFile: libFile });
  const r = runIn(tmp);
  assert.match(r.stderr, /lib-missing-test/);
  assert.match(r.stderr, /mountable_lib\.js/);
});

test("[pre-flight] does not flag a lib with a direct test file", () => {
  const tmp = tempRepo({
    withMountFile: `function compute(a, b) { return a + b; }
export { compute };
`,
  });
  fs.writeFileSync(
    path.join(tmp, "backend", "tests", "mountable_lib.test.mjs"),
    `import { test } from "node:test"; test("smoke", () => {});`,
  );
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /lib-missing-test/);
});

test("[pre-flight] does not flag a lib that is imported by some other test", () => {
  const tmp = tempRepo({
    withMountFile: `function compute(a, b) { return a + b; }
export { compute };
`,
  });
  fs.writeFileSync(
    path.join(tmp, "backend", "tests", "other.test.mjs"),
    `import { compute } from "../lib/mountable_lib.js";
import { test } from "node:test";
test("smoke", () => { compute(1, 2); });
`,
  );
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /lib-missing-test/);
});

test("[pre-flight] does not flag a lib with the no-test-needed opt-out marker", () => {
  const libFile = `// pre-flight: no-test-needed
// pure constants
export const KEYS = ["a", "b", "c"];
`;
  const tmp = tempRepo({ withMountFile: libFile });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /lib-missing-test/);
});

// ---------- task-missing-v1-pillar ----------

test("[pre-flight] flags a YAML-front-matter task without v1_pillar/v1_effect", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-foo.md", `---
id: T-foo
title: Some new task
owner: claude
status: review
---

## Scope

Body without any V1 declarations.
`);
  const r = runIn(tmp);
  assert.match(r.stderr, /task-missing-v1-pillar/);
  assert.match(r.stderr, /T-foo\.md/);
});

test("[pre-flight] accepts YAML v1_pillar + v1_effect", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-bar.md", `---
id: T-bar
title: V1-tagged task
owner: claude
status: review
v1_pillar: talk
v1_effect: closes "Manual smoke" line N
---

## Scope

ok
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-missing-v1-pillar/);
});

test("[pre-flight] accepts body-line V1 pillar/effect", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-baz.md", `---
id: T-baz
title: Body-declaration task
owner: claude
status: review
---

V1 pillar: infra
V1 effect: infrastructure for V1 doc line 12
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-missing-v1-pillar/);
});

test("[pre-flight] grandfathers merged tasks even when v1 declarations are missing", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-old-merged.md", `---
id: T-old-merged
title: A task that shipped before the V1 rule
owner: claude
status: merged
---

## Scope

no V1 fields here.
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-missing-v1-pillar/);
});

test("[pre-flight] grandfathers coord-refresh tasks", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T82-refresh-after-pr204.md", `---
id: T82-refresh-after-pr204
title: Refresh coordination after PR #204
owner: codex
status: review
---

## Scope

Refresh coordination after PR #204 merged.
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-missing-v1-pillar/);
});

test("[pre-flight] flags an invalid v1_pillar value", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-bad-pillar.md", `---
id: T-bad-pillar
title: Wrong pillar value
owner: claude
status: review
v1_pillar: marketing
v1_effect: closes something
---
`);
  const r = runIn(tmp);
  assert.match(r.stderr, /task-invalid-v1-pillar/);
  assert.match(r.stderr, /marketing/);
});

test("[pre-flight] grandfathers files without YAML front matter", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-legacy.md", `# T-legacy

This is an old task file without YAML front matter. Should be
skipped by the v1-pillar rule.
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-missing-v1-pillar/);
});

// ---------- task-id-mismatch-filename ----------

test("[pre-flight] flags a YAML-front-matter task whose id does not match filename", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-foo.md", `---
id: T-bar
title: Mismatched task
owner: claude
status: review
v1_pillar: infra
v1_effect: fixture
---
`);
  const r = runIn(tmp);
  assert.match(r.stderr, /task-id-mismatch-filename/);
  assert.match(r.stderr, /id "T-bar" does not match filename "T-foo"/);
});

test("[pre-flight] accepts a YAML-front-matter task whose id matches filename", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-foo.md", `---
id: T-foo
title: Matched task
owner: claude
status: review
v1_pillar: infra
v1_effect: fixture
---
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-id-mismatch-filename/);
});

test("[pre-flight] does not apply task-id filename rule to legacy non-YAML tasks", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-legacy-name.md", `# T-not-the-filename

Legacy task file without YAML front matter.
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-id-mismatch-filename/);
});

// ---------- task-status-vocabulary ----------

test("[pre-flight] flags YAML task files missing status", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-missing-status.md", `---
id: T-missing-status
title: Missing status task
owner: claude
v1_pillar: infra
v1_effect: validates task status rollups
---
`);
  const r = runIn(tmp);
  assert.match(r.stderr, /task-missing-status/);
  assert.match(r.stderr, /T-missing-status\.md/);
});

test("[pre-flight] flags invalid task status values", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-invalid-status.md", `---
id: T-invalid-status
title: Invalid status task
owner: claude
status: shipped
v1_pillar: infra
v1_effect: validates task status rollups
---
`);
  const r = runIn(tmp);
  assert.match(r.stderr, /task-invalid-status/);
  assert.match(r.stderr, /shipped/);
});

test("[pre-flight] accepts AGENTS workflow task statuses", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-ready-for-claude.md", `---
id: T-ready-for-claude
title: Ready for Claude task
owner: claude
status: ready-for-claude
v1_pillar: infra
v1_effect: validates task status rollups
---
`);
  writeTaskFile(tmp, "T-ready.md", `---
id: T-ready
title: Ready task
owner: codex
status: ready
v1_pillar: infra
v1_effect: validates task status rollups
---
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-invalid-status/);
  assert.doesNotMatch(r.stderr, /task-missing-status/);
});

test("[pre-flight] accepts grandfathered task statuses already in the repo", () => {
  const tmp = tempRepo();
  for (const status of ["open", "blocked", "parked", "closed", "draft", "planned", "in-progress"]) {
    writeTaskFile(tmp, `T-${status}.md`, `---
id: T-${status}
title: ${status} task
owner: codex
status: ${status}
v1_pillar: infra
v1_effect: validates task status rollups
---
`);
  }
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-invalid-status/);
  assert.doesNotMatch(r.stderr, /task-missing-status/);
});

test("[pre-flight] status vocabulary skips legacy and coord-refresh tasks", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-legacy-status.md", `# T-legacy-status

Legacy task body without YAML.
`);
  writeTaskFile(tmp, "T84-refresh-after-pr250.md", `---
id: T84-refresh-after-pr250
title: Refresh coordination after PR #250
owner: codex
v1_pillar: infra
v1_effect: updates coordination metadata
---

Refresh coordination after PR #250 merged.
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-missing-status/);
  assert.doesNotMatch(r.stderr, /task-invalid-status/);
});
