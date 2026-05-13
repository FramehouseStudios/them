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
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-preflight-"));
  fs.mkdirSync(path.join(tmp, "scripts"));
  fs.mkdirSync(path.join(tmp, "backend", "lib"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "backend", "evals"), { recursive: true });
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
  return tmp;
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
