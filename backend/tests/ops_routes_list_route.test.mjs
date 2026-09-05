// T-ops-routes-list-route — unit + integration tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  mountOpsRoutesListRoute,
  CURATED_ROUTES,
  ROUTES,
  SCOPE_DESCRIPTION,
  OPS_ROUTES_LIST_SCHEMA_VERSION,
} from "../lib/ops_routes_list_route.js";

// ---------- snapshot ----------

test("[ops-routes] CURATED_ROUTES is frozen + every entry is frozen", () => {
  assert.ok(Object.isFrozen(CURATED_ROUTES));
  for (const r of CURATED_ROUTES) assert.ok(Object.isFrozen(r));
});

test("[ops-routes] back-compat: ROUTES alias === CURATED_ROUTES", () => {
  assert.equal(ROUTES, CURATED_ROUTES);
});

test("[ops-routes] every entry has method + path + group", () => {
  const allowedMethods = new Set(["GET", "POST", "DELETE", "PUT", "PATCH"]);
  for (const r of CURATED_ROUTES) {
    assert.ok(allowedMethods.has(r.method), `unknown method: ${r.method}`);
    assert.ok(typeof r.path === "string" && r.path.startsWith("/"), `bad path: ${r.path}`);
    assert.ok(typeof r.group === "string" && r.group.length > 0, `bad group: ${r.group}`);
  }
});

test("[ops-routes] no duplicate method+path pairs", () => {
  const seen = new Set();
  for (const r of CURATED_ROUTES) {
    const key = `${r.method} ${r.path}`;
    assert.ok(!seen.has(key), `duplicate: ${key}`);
    seen.add(key);
  }
});

// ---------- scope rule (load-bearing per Codex #148 review) ----------

test("[ops-routes] scope rule: manifest EXCLUDES auth/* routes", () => {
  for (const r of CURATED_ROUTES) {
    assert.ok(
      !r.path.startsWith("/auth/"),
      `auth route ${r.path} should not appear in the curated subset`,
    );
  }
});

test("[ops-routes] scope rule: manifest EXCLUDES /ops/health-summary and /ops/routes", () => {
  for (const r of CURATED_ROUTES) {
    assert.notEqual(r.path, "/ops/health-summary", "self-reference should be excluded");
    assert.notEqual(r.path, "/ops/routes", "self-reference should be excluded");
  }
});

test("[ops-routes] scope rule: manifest INCLUDES the canonical app-facing groups", () => {
  const groups = new Set(CURATED_ROUTES.map((r) => r.group));
  for (const required of ["creative-memory", "screenplay-export", "talk-pipeline", "ops"]) {
    assert.ok(groups.has(required), `missing required group: ${required}`);
  }
});

// ---------- endpoint integration ----------

async function withTestServer(fn) {
  const app = express();
  mountOpsRoutesListRoute(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, headers: Object.fromEntries(r.headers), body: await r.json().catch(() => null) };
}

test("[ops-routes] GET /ops/routes returns the manifest", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/ops/routes");
    assert.equal(r.status, 200);
    assert.equal(r.body.schemaVersion, OPS_ROUTES_LIST_SCHEMA_VERSION);
    assert.equal(r.body.total, CURATED_ROUTES.length);
    assert.equal(r.body.routes.length, CURATED_ROUTES.length);
    assert.equal(r.headers["cache-control"], "no-store");
  });
});

test("[ops-routes] response includes the explicit scope string", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/ops/routes");
    assert.equal(typeof r.body.scope, "string");
    assert.equal(r.body.scope, SCOPE_DESCRIPTION);
    assert.match(r.body.scope, /[Cc]urated/);
    assert.match(r.body.scope, /[Nn]ot a reflection/);
  });
});

test("[ops-routes] mountOpsRoutesListRoute requires an Express app", () => {
  assert.throws(() => mountOpsRoutesListRoute(null));
});
