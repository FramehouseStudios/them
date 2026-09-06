// D009 — the extracted route modules take their index.js collaborators
// through `deps` and must refuse to mount when one is missing, so a
// wiring mistake fails at boot instead of on the first request.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountSessionRoute, SESSION_ROUTE_REQUIRED_DEPS } from "../lib/session_route.js";
import { mountVisualContextRoute, VISUAL_CONTEXT_ROUTE_REQUIRED_DEPS } from "../lib/visual_context_route.js";

const passthrough = (_req, _res, next) => next();

// Shape each collaborator the way the route actually uses it: limiters and
// budget guards expose `.middleware(name)`, `require*` / `*Guard` names are
// Express middleware, everything else is a plain function.
function stubDeps(names) {
  const deps = {};
  for (const name of names) {
    if (/RateLimiter$|BudgetGuard$/.test(name)) deps[name] = { middleware: () => passthrough };
    else if (/^require|Guard$/.test(name)) deps[name] = passthrough;
    else deps[name] = () => {};
  }
  return deps;
}

function registeredPaths(app) {
  return (app._router?.stack || [])
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods).join(",").toUpperCase()} ${layer.route.path}`);
}

for (const [label, mount, required, path] of [
  ["session", mountSessionRoute, SESSION_ROUTE_REQUIRED_DEPS, "POST /session"],
  ["visual-context", mountVisualContextRoute, VISUAL_CONTEXT_ROUTE_REQUIRED_DEPS, "POST /visual/context"],
]) {
  test(`[route-mount] ${label}: requires an Express app`, () => {
    assert.throws(() => mount(null, stubDeps(required)), /requires an Express app/);
  });

  test(`[route-mount] ${label}: every required dependency is named and a missing one fails at mount`, () => {
    assert.ok(Object.isFrozen(required));
    assert.ok(required.length >= 5, `${label} should list its collaborators`);
    const deps = stubDeps(required);
    const dropped = required[required.length - 1];
    delete deps[dropped];
    assert.throws(() => mount(express(), deps), new RegExp(`missing dependencies: .*${dropped}`));
    // Nothing was registered on the app when mounting failed.
    const app = express();
    try { mount(app, deps); } catch {}
    assert.deepEqual(registeredPaths(app), []);
  });

  test(`[route-mount] ${label}: mounts exactly its route when every dependency is present`, () => {
    const app = express();
    mount(app, stubDeps(required));
    assert.deepEqual(registeredPaths(app), [path]);
  });
}
