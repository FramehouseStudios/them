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
  withV1ManualQaGenerator,
  withV1ManualQaDoc,
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-preflight-"));
  fs.writeFileSync(path.join(tmp, ".gitignore"), [
    ".env",
    ".env.*",
    "*.env",
    "them/Release.local.env",
    "them/Release.local.xcconfig",
    "",
  ].join("\n"));
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
  if (withV1ManualQaGenerator) {
    fs.writeFileSync(path.join(tmp, "scripts", "v1_manual_qa_checklist.mjs"), withV1ManualQaGenerator);
  }
  if (withV1ManualQaDoc) {
    fs.writeFileSync(path.join(tmp, "docs", "testflight-v1-preflight.md"), withV1ManualQaDoc);
  }
  return tmp;
}

function writeTaskFile(tmp, name, body) {
  fs.mkdirSync(path.join(tmp, "tasks", "_active"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "tasks", "_active", name), body);
}

function writeManualQaGenerator(tmp, body) {
  const escapedBody = JSON.stringify(body);
  fs.writeFileSync(
    path.join(tmp, "scripts", "v1_manual_qa_checklist.mjs"),
    `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const body = ${escapedBody};
const writeArg = process.argv.find((arg) => arg.startsWith("--write="));
if (writeArg) {
  const target = writeArg.slice("--write=".length);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
} else {
  process.stdout.write(body);
}
`,
  );
}

function runIn(tmp, extraArgs = []) {
  return spawnSync("node", [path.join(tmp, "scripts", "pre_flight.mjs"), ...extraArgs], { encoding: "utf8" });
}

function runGit(tmp, args) {
  const r = spawnSync("git", args, { cwd: tmp, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  return r.stdout.trim();
}

function initGitWithOriginMain(tmp) {
  runGit(tmp, ["init"]);
  runGit(tmp, ["config", "user.email", "codex@example.invalid"]);
  runGit(tmp, ["config", "user.name", "Codex Test"]);
  runGit(tmp, ["add", "."]);
  runGit(tmp, ["commit", "-m", "base"]);
  const base = runGit(tmp, ["rev-parse", "HEAD"]);
  runGit(tmp, ["update-ref", "refs/remotes/origin/main", base]);
}

function commitAll(tmp, message) {
  runGit(tmp, ["add", "."]);
  runGit(tmp, ["commit", "-m", message]);
}

// ---------- empty repo path ----------

test("[pre-flight] clean repo with no lib/ → exit 0, no findings", () => {
  const tmp = tempRepo();
  const r = runIn(tmp);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /pre-flight: OK/);
});

test("[pre-flight] flags tracked provider secrets without printing the value", () => {
  const tmp = tempRepo();
  const fakeSecret = "sk-proj-" + "A".repeat(48);
  fs.writeFileSync(path.join(tmp, "backend", "config.js"), `export const key = "${fakeSecret}";\n`);
  initGitWithOriginMain(tmp);
  const r = runIn(tmp, ["--strict"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /secret-hygiene/);
  assert.match(r.stderr, /backend\/config\.js:1/);
  assert.match(r.stderr, /openai-project-key/);
  assert.doesNotMatch(r.stderr, new RegExp(fakeSecret));
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

test("[pre-flight] route with route-local express.text is NOT flagged", () => {
  const route = `
import express from "express";
function mountFoo(app) {
  app.post("/foo", express.text({ type: "text/plain" }), (req, res) => {
    const x = String(req.body || "");
    return res.send(x);
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

// ---------- generated-testflight-preflight-drift ----------

test("[pre-flight] flags generated TestFlight preflight drift", () => {
  const tmp = tempRepo();
  writeManualQaGenerator(tmp, "# io.them V1 TestFlight Preflight\n\nfresh\n");
  fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "docs", "testflight-v1-preflight.md"), "# io.them V1 TestFlight Preflight\n\nstale\n");
  const r = runIn(tmp);
  assert.match(r.stderr, /generated-testflight-preflight-drift/);
  assert.match(r.stderr, /v1_manual_qa_checklist\.mjs --write=docs\/testflight-v1-preflight\.md/);
});

test("[pre-flight] accepts generated TestFlight preflight artifact in sync", () => {
  const tmp = tempRepo();
  const body = "# io.them V1 TestFlight Preflight\n\nfresh\n";
  writeManualQaGenerator(tmp, body);
  fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "docs", "testflight-v1-preflight.md"), body);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /generated-testflight-preflight-drift/);
});

// ---------- schema-doc-only-out-of-lane ----------

const supportInboxSchemaOnlyParked = `
# support agent Inbox

## Current Command

Do not open more schema-doc-only PRs unless Codex asks. Schema docs only when
paired with code or requested by Codex.
`;

test("[pre-flight] flags schema-doc-only branches when support agent inbox parks them", () => {
  const tmp = tempRepo();
  fs.writeFileSync(path.join(tmp, "docs", "support-inbox.md"), supportInboxSchemaOnlyParked);
  initGitWithOriginMain(tmp);
  fs.writeFileSync(path.join(tmp, "docs", "schemas", "talk-response.md"), "# talk response\n");
  writeTaskFile(tmp, "T-schema-doc-only.md", `---
id: T-schema-doc-only
title: Schema doc only
owner: support
status: review
v1_pillar: infra
v1_effect: documents an existing schema
---
`);
  commitAll(tmp, "schema doc only");
  const r = runIn(tmp);
  assert.match(r.stderr, /schema-doc-only-out-of-lane/);
  assert.match(r.stderr, /paired with code/);
});

test("[pre-flight] allows schema docs paired with implementation files", () => {
  const tmp = tempRepo();
  fs.writeFileSync(path.join(tmp, "docs", "support-inbox.md"), supportInboxSchemaOnlyParked);
  initGitWithOriginMain(tmp);
  fs.writeFileSync(path.join(tmp, "docs", "schemas", "talk-response.md"), "# talk response\n");
  fs.writeFileSync(
    path.join(tmp, "backend", "lib", "talk_response_shape.js"),
    `// pre-flight: no-test-needed
export function talkResponseShape() {
  return { schemaVersion: 1 };
}
`,
  );
  writeTaskFile(tmp, "T-schema-with-code.md", `---
id: T-schema-with-code
title: Schema doc paired with code
owner: support
status: review
v1_pillar: infra
v1_effect: keeps schema docs with implementation changes
---
`);
  commitAll(tmp, "schema doc with code");
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /schema-doc-only-out-of-lane/);
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
owner: support
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
owner: support
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
owner: support
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
owner: support
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
owner: support
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
owner: support
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
owner: support
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
owner: support
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
owner: support
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
  writeTaskFile(tmp, "T-ready-for-support.md", `---
id: T-ready-for-support
title: Ready for support agent task
owner: support
status: ready-for-support
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

// ---------- task-archive-merged ----------

test("[pre-flight] task-archive-merged: flags status:merged in _active/ with post-cutoff first commit", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-new-merged-task.md", `---
id: T-new-merged-task
title: New merged task
owner: support
status: merged
v1_pillar: infra
v1_effect: testing
---

Body.
`);
  initGitWithOriginMain(tmp);
  const r = runIn(tmp);
  assert.match(r.stderr, /task-archive-merged/);
  assert.match(r.stderr, /T-new-merged-task\.md/);
});

test("[pre-flight] task-archive-merged: grandfathers explicit pre-cutoff merged_at", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-old-merged.md", `---
id: T-old-merged
title: Pre-rule merged task
owner: support
status: merged
merged_at: 2026-05-10T00:00:00Z
v1_pillar: infra
v1_effect: testing
---

Body.
`);
  initGitWithOriginMain(tmp);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-archive-merged/);
});

test("[pre-flight] task-archive-merged: grandfathers body-line Merged-At pre-cutoff", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-body-merged-at.md", `---
id: T-body-merged-at
title: Body-line merged-at
owner: support
status: merged
v1_pillar: infra
v1_effect: testing
---

Merged-At: 2026-05-12T00:00:00Z

Body.
`);
  initGitWithOriginMain(tmp);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-archive-merged/);
});

test("[pre-flight] task-archive-merged: skips status:review", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-still-in-review.md", `---
id: T-still-in-review
title: Still in review
owner: support
status: review
v1_pillar: infra
v1_effect: testing
---

Body.
`);
  initGitWithOriginMain(tmp);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-archive-merged/);
});

test("[pre-flight] task-archive-merged: skips files without YAML front matter", () => {
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-legacy-no-yaml.md", `# Legacy task

No YAML, no front matter. Body says "status: merged" but the
rule should not parse plain prose.

status: merged
`);
  initGitWithOriginMain(tmp);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /task-archive-merged/);
});

test("[pre-flight] task-archive-merged: handles missing git silently", () => {
  // No git init — no .git directory. Rule should NOT throw, just skip.
  const tmp = tempRepo();
  writeTaskFile(tmp, "T-no-git.md", `---
id: T-no-git
title: No git available
owner: support
status: merged
v1_pillar: infra
v1_effect: testing
---

Body.
`);
  const r = runIn(tmp);
  // No git means the rule can't compute a timestamp → skips.
  // Other unrelated findings may still fire; verify the script
  // exits 0 (warn-only default).
  assert.equal(r.status, 0);
});

// ---------- schema-doc-missing-endpoint ----------

function writeSchemaDoc(tmp, name, body) {
  fs.mkdirSync(path.join(tmp, "docs", "schemas"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "docs", "schemas", name), body);
}

function writeBackendIndex(tmp, body) {
  fs.mkdirSync(path.join(tmp, "backend"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "backend", "index.js"), body);
}

function writeBackendLibFile(tmp, name, body) {
  fs.mkdirSync(path.join(tmp, "backend", "lib"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "backend", "lib", name), body);
}

test("[pre-flight] schema-doc-missing-endpoint: fires when documented route is not in backend", () => {
  const tmp = tempRepo();
  writeSchemaDoc(tmp, "ghost.md", `# ghost

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| POST | \`/ghost/route\` | 200 envelope |
`);
  writeBackendIndex(tmp, `app.get("/something-else", () => {});\n`);
  const r = runIn(tmp);
  assert.match(r.stderr, /schema-doc-missing-endpoint/);
  assert.match(r.stderr, /POST \/ghost\/route/);
  assert.match(r.stderr, /ghost\.md/);
});

test("[pre-flight] schema-doc-missing-endpoint: accepts a route registered in backend/lib/", () => {
  const tmp = tempRepo();
  writeSchemaDoc(tmp, "real.md", `# real

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| POST | \`/real/route\` | 200 envelope |
`);
  writeBackendLibFile(tmp, "real_route.js", `function mountRealRoute(app) {
  app.post("/real/route", (req, res) => res.status(200).json({}));
}
export { mountRealRoute };
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /schema-doc-missing-endpoint/);
});

test("[pre-flight] schema-doc-missing-endpoint: matches multi-line app.method() registrations", () => {
  const tmp = tempRepo();
  writeSchemaDoc(tmp, "split.md", `# split

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| POST | \`/split/route\` | 200 envelope |
`);
  writeBackendLibFile(tmp, "split_route.js", `function mountSplitRoute(app) {
  app.post(
    "/split/route",
    express.json({ limit: "2mb" }),
    (req, res) => res.status(200).json({}),
  );
}
export { mountSplitRoute };
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /schema-doc-missing-endpoint/);
});

test("[pre-flight] schema-doc-missing-endpoint: handles :param divergence between doc and code", () => {
  const tmp = tempRepo();
  writeSchemaDoc(tmp, "param-divergence.md", `# param-divergence

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | \`/talk/turn/:turnId\` | meta envelope |
`);
  writeBackendLibFile(tmp, "talk_turn_meta_route.js", `function mountTalkTurnMeta(app) {
  app.get("/talk/turn/:id", (req, res) => res.status(200).json({}));
}
export { mountTalkTurnMeta };
`);
  const r = runIn(tmp);
  // Doc uses :turnId, code uses :id — rule treats both as wildcard
  // params and matches.
  assert.doesNotMatch(r.stderr, /schema-doc-missing-endpoint/);
});

test("[pre-flight] schema-doc-missing-endpoint: skips docs without an Endpoints section", () => {
  const tmp = tempRepo();
  writeSchemaDoc(tmp, "record-shape.md", `# record-shape

## Field set

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | record id |
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /schema-doc-missing-endpoint/);
});

test("[pre-flight] schema-doc-missing-endpoint: skips INDEX.md and README.md", () => {
  const tmp = tempRepo();
  writeSchemaDoc(tmp, "INDEX.md", `# INDEX

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| POST | \`/nonexistent\` | 200 |
`);
  writeSchemaDoc(tmp, "README.md", `# README

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | \`/also-nonexistent\` | 200 |
`);
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /schema-doc-missing-endpoint/);
});

// ---------- generated V1 manual QA checklist drift ----------

test("[pre-flight] flags stale generated TestFlight checklist", () => {
  const generator = `
console.log("# io.them V1 TestFlight Preflight");
console.log("");
console.log("fresh five-flow checklist");
`;
  const tmp = tempRepo({
    withV1ManualQaGenerator: generator,
    withV1ManualQaDoc: "# io.them V1 TestFlight Preflight\n\nstale four-flow checklist\n",
  });
  const r = runIn(tmp);
  assert.match(r.stderr, /generated-v1-manual-qa-drift/);
  assert.match(r.stderr, /v1_manual_qa_checklist\.mjs --write=docs\/testflight-v1-preflight\.md/);
});

test("[pre-flight] current generated TestFlight checklist is NOT flagged", () => {
  const generator = `
console.log("# io.them V1 TestFlight Preflight");
console.log("");
console.log("fresh five-flow checklist");
`;
  const tmp = tempRepo({
    withV1ManualQaGenerator: generator,
    withV1ManualQaDoc: "# io.them V1 TestFlight Preflight\n\nfresh five-flow checklist\n",
  });
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /generated-v1-manual-qa-drift/);
});

// ---------- stale V1 launch handoff instructions ----------

test("[pre-flight] flags stale V1 launch handoff instructions", () => {
  const tmp = tempRepo();
  fs.writeFileSync(
    path.join(tmp, "docs", "v1-release-smoke-clearance.md"),
    [
      "support agent should fix PR #33's eval-quality failures first. Launch Doctor result: 0/4 flows passed.",
      "Provide the hosted release `BACKEND_URL` and production app token.",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(tmp, "docs", "coordination.json"),
    JSON.stringify({
      openPullRequests: [
        {
          reviewer_note: "release preflight still blocks on missing Development Team, Release BACKEND_URL, and Release APP_TOKEN.",
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(tmp, "TASKS.md"),
    "Add a template so the Apple team ID, hosted backend URL, and production app token can be supplied.\n",
  );
  fs.writeFileSync(
    path.join(tmp, "scripts", "v1_launch_room.mjs"),
    "Records the Talk, Studio, Memory, and Realtime smoke result as JSON/Markdown launch proof.\n",
  );
  fs.mkdirSync(path.join(tmp, "them"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "them", "RELEASE_RUNBOOK.md"),
    [
      "cd /Users/halfmutantfilms/Desktop/io.them",
      "Fill `DEVELOPMENT_TEAM_ID`, `BACKEND_URL`, and `APP_TOKEN_RELEASE`.",
      "",
    ].join("\n"),
  );
  const r = runIn(tmp);
  assert.match(r.stderr, /stale-v1-launch-handoff/);
  assert.match(r.stderr, /PR #33\/#359 are merged/);
  assert.match(r.stderr, /five V1 gates/);
  assert.match(r.stderr, /include iOS Release Readiness/);
  assert.match(r.stderr, /BACKEND_URL is already hosted/);
  assert.match(r.stderr, /coordination state must treat release BACKEND_URL as hosted/);
  assert.match(r.stderr, /task handoff text must treat release BACKEND_URL as hosted/);
  assert.match(r.stderr, /repo-relative paths/);
  assert.match(r.stderr, /DEVELOPMENT_TEAM_ID and APP_TOKEN_RELEASE only/);
});

test("[pre-flight] current V1 launch handoff instructions are NOT flagged", () => {
  const tmp = tempRepo();
  fs.writeFileSync(
    path.join(tmp, "docs", "v1-release-smoke-clearance.md"),
    "support agent should stay in V1 manual-smoke support mode. Launch Doctor result: not_started, 0/5 flows passed.\n",
  );
  fs.writeFileSync(
    path.join(tmp, "docs", "coordination.json"),
    JSON.stringify({
      openPullRequests: [
        {
          reviewer_note: "Release BACKEND_URL is hosted as https://api.them.io; missing private inputs are DEVELOPMENT_TEAM_ID and APP_TOKEN_RELEASE.",
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(tmp, "TASKS.md"),
    "Release `BACKEND_URL` is hosted as `https://api.them.io`; fill `DEVELOPMENT_TEAM_ID` and `APP_TOKEN_RELEASE`.\n",
  );
  fs.writeFileSync(
    path.join(tmp, "scripts", "v1_launch_room.mjs"),
    "Records Talk, Studio, Memory, Realtime, and iOS Release Readiness as JSON/Markdown launch proof.\n",
  );
  fs.mkdirSync(path.join(tmp, "them"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "them", "RELEASE_RUNBOOK.md"),
    [
      "Fill `DEVELOPMENT_TEAM_ID` and `APP_TOKEN_RELEASE` in `them/Release.local.env`.",
      "Keep `BACKEND_URL=https://api.them.io` unless the hosted release backend changes.",
      "",
    ].join("\n"),
  );
  const r = runIn(tmp);
  assert.doesNotMatch(r.stderr, /stale-v1-launch-handoff/);
});

test("[pre-flight] schema-doc-missing-endpoint: handles multiple endpoints per doc", () => {
  const tmp = tempRepo();
  writeSchemaDoc(tmp, "multi.md", `# multi

## Endpoints

| Method | Path | Verb | Returns |
| --- | --- | --- | --- |
| POST | \`/multi/exists\` | mutate | 200 |
| POST | \`/multi/missing\` | mutate | 200 |
`);
  writeBackendLibFile(tmp, "multi_route.js", `function mountMulti(app) {
  app.post("/multi/exists", (req, res) => res.status(200).json({}));
}
export { mountMulti };
`);
  const r = runIn(tmp);
  // Should fire ONLY on /multi/missing.
  assert.match(r.stderr, /\/multi\/missing/);
  assert.doesNotMatch(r.stderr, /\/multi\/exists/);
});
