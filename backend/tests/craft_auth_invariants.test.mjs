// Day 1–3 sprint rescue: /craft/* auth invariants.
//
// (a) Route-enumeration invariant. Walks the real Express router after
//     mountCraftRoutes() and proves, at runtime, that every registered
//     /craft route either 401s without a canonical user or is on the
//     literal public allowlist below. A new /craft route that forgets the
//     mount-level gate fails here; a new public route is a visible diff.
// (b) Cross-account invariant. Two authenticated users share the same
//     projectId string; the second user must not be able to read, list,
//     or delete the first user's craft data on any projectId route, even
//     when the project-access seam says "yes" — isolation rests on
//     craftStorageProjectId namespacing, which this test pins.
// (c) Prompt-wire invariant. The talk prompt assembler in index.js reads
//     accepted twists through the same per-user namespace instead of the
//     raw body projectId.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import { PAID_PROVIDER_PATTERNS, USER_PROTECTED_PATTERNS } from "../lib/user_auth.js";
import {
  craftStorageProjectId,
  isPublicCraftRoute,
  mountCraftRoutes,
} from "../lib/craft_routes.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { configureAcceptedTwistLog } from "../lib/accepted_twist_log.js";
import { configureLoglineDistiller } from "../lib/logline_distiller.js";
import { _resetCraftStores, configureCraftAnalysis } from "../lib/craft_analysis.js";

// Literal public allowlist. Adding a public /craft route means editing this
// list in the same diff as the route.
const PUBLIC_CRAFT_ALLOWLIST = [
  "GET /craft/frameworks",
  "GET /craft/frameworks/:frameworkId",
  "GET /craft/schemas/framework",
  "GET /craft/schemas/report",
];

const TEST_USER_HEADER = "x-test-user";

function collectRegisteredCraftRoutes(app) {
  const stack = app._router?.stack ?? app.router?.stack ?? [];
  const routes = [];
  for (const layer of stack) {
    if (!layer.route?.path) continue;
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const routePath of paths) {
      if (!String(routePath).startsWith("/craft")) continue;
      for (const method of Object.keys(layer.route.methods || {})) {
        routes.push({ method: method.toUpperCase(), path: routePath });
      }
    }
  }
  return routes;
}

function concretePath(routePath) {
  return String(routePath).replace(/:[A-Za-z0-9_]+\??/g, "test");
}

function freshPersistence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-craft-invariants-"));
  return createJsonPersistence({ jsonRoot: root });
}

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(baseURL);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(baseURL, method, urlPath, { user = null, json = null } = {}) {
  const headers = {};
  if (user) headers[TEST_USER_HEADER] = user;
  if (json !== null) headers["content-type"] = "application/json";
  const r = await fetch(`${baseURL}${urlPath}`, {
    method,
    headers,
    body: json !== null ? JSON.stringify(json) : undefined,
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

function buildUnauthenticatedCraftApp() {
  const app = express();
  app.use(express.json());
  mountCraftRoutes(app);
  return app;
}

function buildTwoUserCraftApp(persistence) {
  _resetCraftStores();
  configureCraftAnalysis({ persistence });
  configureLoglineDistiller({ persistence, classifier: null });
  configureAcceptedTwistLog({ persistence });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = String(req.get(TEST_USER_HEADER) || "").trim();
    if (id) {
      req.authUser = { id };
      req.userId = id;
    }
    next();
  });
  // authorizeProjectAccess always says yes: the point is to prove isolation
  // does not depend on the project-ownership lookup.
  mountCraftRoutes(app, { authorizeProjectAccess: async () => true });
  return app;
}

// ---------------------------------------------------------------- (a)

test("[craft-invariants] the public /craft allowlist is exactly the literal list", () => {
  const app = buildUnauthenticatedCraftApp();
  const routes = collectRegisteredCraftRoutes(app);
  assert.ok(routes.length >= 15, `expected the real craft router, saw ${routes.length} routes`);
  const publicRoutes = routes
    .filter(({ method, path: routePath }) => isPublicCraftRoute(method, concretePath(routePath).replace(/^\/craft/, "")))
    .map(({ method, path: routePath }) => `${method} ${routePath}`)
    .sort();
  assert.deepEqual(publicRoutes, [...PUBLIC_CRAFT_ALLOWLIST].sort());
});

test("[craft-invariants] every registered non-public /craft route 401s without a canonical user", async () => {
  const app = buildUnauthenticatedCraftApp();
  const routes = collectRegisteredCraftRoutes(app);
  await withServer(app, async (baseURL) => {
    for (const { method, path: routePath } of routes) {
      const target = concretePath(routePath);
      const isPublic = PUBLIC_CRAFT_ALLOWLIST.includes(`${method} ${routePath}`);
      const json = ["POST", "PUT", "PATCH"].includes(method) ? {} : null;
      const { status, body } = await request(baseURL, method, target, { json });
      if (isPublic) {
        assert.notEqual(status, 401, `${method} ${routePath} is allowlisted public but returned 401`);
        continue;
      }
      assert.equal(status, 401, `${method} ${routePath} must fail closed without a user (got ${status})`);
      assert.equal(body?.stage, "craft_auth", `${method} ${routePath} stage`);
      assert.equal(body?.error, "user_auth_required", `${method} ${routePath} error`);
    }
  });
});

test("[craft-invariants] a probe route added under /craft without the gate is caught", async () => {
  const app = buildUnauthenticatedCraftApp();
  // The mount-level gate is `app.use("/craft", ...)`, so anything mounted
  // after it is covered. This proves the enumeration sees the runtime
  // router (not a hand-maintained list) and that the gate is positional.
  app.get("/craft/zzz-probe", (_req, res) => res.json({ ok: true }));
  const routes = collectRegisteredCraftRoutes(app);
  assert.ok(routes.some((r) => r.path === "/craft/zzz-probe"), "enumeration must see the probe route");
  await withServer(app, async (baseURL) => {
    const { status, body } = await request(baseURL, "GET", "/craft/zzz-probe");
    assert.equal(status, 401);
    assert.equal(body?.stage, "craft_auth");
  });
});

test("[craft-invariants] cost-attached craft routes are also in PAID_PROVIDER_PATTERNS", () => {
  for (const p of ["/craft/analyze", "/craft/logline/distill"]) {
    assert.ok(PAID_PROVIDER_PATTERNS.some((rx) => rx.test(p)), `PAID_PROVIDER_PATTERNS must cover ${p}`);
  }
  // /craft is gated at the mount, not via the global REQUIRE_USER_AUTH list;
  // keep that explicit so nobody "fixes" it by adding /craft there and then
  // removing the mount gate.
  assert.equal(USER_PROTECTED_PATTERNS.some((rx) => rx.test("/craft/test")), false);
});

// ---------------------------------------------------------------- (b)

test("[craft-invariants] craftStorageProjectId cannot be forged by a projectId string", () => {
  const alice = craftStorageProjectId("alice", "shared");
  const bob = craftStorageProjectId("bob", "shared");
  assert.notEqual(alice, bob);
  // A user who learns another user's storage key and submits it as their
  // own projectId lands in their own namespace, not the victim's.
  assert.notEqual(craftStorageProjectId("bob", alice), alice);
  // Separator-looking characters in ids cannot cross namespace boundaries.
  assert.notEqual(craftStorageProjectId("a", "b.project.c"), craftStorageProjectId("a.project.b", "c"));
});

test("[craft-invariants] cross-account: bob cannot read, list, or delete alice's craft data on any projectId route", async () => {
  const persistence = freshPersistence();
  const app = buildTwoUserCraftApp(persistence);
  const alice = `alice-${Date.now()}`;
  const bob = `bob-${Date.now()}`;
  const projectId = "shared-project-id";
  const twist = { id: "t-alice", label: "ALICE", hook: "ALICE CONFIDENTIAL", severity: "high" };
  const scenes = [
    { id: "s1", title: "INT. HOUSE - DAY", text: "Opening", page: 12 },
    { id: "s2", title: "INT. BRIDGE - NIGHT", text: "Midpoint", page: 55 },
    { id: "s3", title: "INT. BUNKER - NIGHT", text: "All is lost", page: 75 },
    { id: "s4", title: "EXT. ROOFTOP - DAWN", text: "Finale", page: 95 },
  ];

  await withServer(app, async (baseURL) => {
    // Alice writes on every persisted craft surface.
    const accepted = await request(baseURL, "POST", "/craft/twist/accepted", {
      user: alice, json: { projectId, versionId: "v1", twist },
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const distilled = await request(baseURL, "POST", "/craft/logline/distill", {
      user: alice, json: { projectId, versionId: "v1", text: "A lonely lighthouse keeper must stop a storm from erasing her town." },
    });
    assert.equal(distilled.status, 200, JSON.stringify(distilled.body));
    const aliceLogline = String(distilled.body.logline || "");
    assert.ok(aliceLogline, "stub distiller must produce a logline to isolate");
    const analyzed = await request(baseURL, "POST", "/craft/analyze", {
      user: alice,
      json: { projectId, versionId: "v1", frameworkId: "save-the-cat", screenplay: { pageCount: 110, title: "Alice", scenes } },
    });
    assert.equal(analyzed.status, 200, JSON.stringify(analyzed.body));

    // Bob, with the same projectId string, sees nothing.
    const bobTwists = await request(baseURL, "GET", `/craft/twist/accepted?projectId=${projectId}`, { user: bob });
    assert.equal(bobTwists.status, 200);
    assert.deepEqual(bobTwists.body.entries, []);
    const bobHistory = await request(baseURL, "GET", `/craft/logline/history?projectId=${projectId}`, { user: bob });
    assert.equal(bobHistory.status, 200);
    assert.deepEqual(bobHistory.body.entries ?? bobHistory.body.history ?? [], []);
    assert.ok(!JSON.stringify(bobHistory.body).includes(aliceLogline));
    const bobDrift = await request(baseURL, "GET", `/craft/logline/drift?projectId=${projectId}&currentLogline=x`, { user: bob });
    assert.equal(bobDrift.status, 200);
    assert.ok(!JSON.stringify(bobDrift.body).includes(aliceLogline));
    const bobReport = await request(baseURL, "GET", `/craft/reports/${projectId}/v1`, { user: bob });
    assert.equal(bobReport.status, 404, JSON.stringify(bobReport.body));
    const bobLatest = await request(baseURL, "GET", `/craft/reports/${projectId}`, { user: bob });
    assert.equal(bobLatest.status, 404, JSON.stringify(bobLatest.body));

    // Bob submitting alice's *storage key* as his projectId still lands in
    // bob's namespace.
    const aliceKey = craftStorageProjectId(alice, projectId);
    const forged = await request(baseURL, "GET", `/craft/twist/accepted?projectId=${encodeURIComponent(aliceKey)}`, { user: bob });
    assert.equal(forged.status, 200);
    assert.deepEqual(forged.body.entries, []);

    // Bob cannot delete alice's twist.
    const bobDelete = await request(baseURL, "DELETE", `/craft/twist/accepted/${twist.id}?projectId=${projectId}`, { user: bob });
    assert.notEqual(bobDelete.status, 200);

    // Alice's data is intact and still hers.
    const aliceTwists = await request(baseURL, "GET", `/craft/twist/accepted?projectId=${projectId}`, { user: alice });
    assert.equal(aliceTwists.status, 200);
    assert.equal(aliceTwists.body.entries.length, 1);
    assert.equal(aliceTwists.body.entries[0].twist.hook, "ALICE CONFIDENTIAL");
    const aliceReport = await request(baseURL, "GET", `/craft/reports/${projectId}/v1`, { user: alice });
    assert.equal(aliceReport.status, 200);
    assert.equal(aliceReport.body.id, analyzed.body.id);
    const aliceHistory = await request(baseURL, "GET", `/craft/logline/history?projectId=${projectId}`, { user: alice });
    assert.equal(aliceHistory.status, 200);
    const aliceEntries = aliceHistory.body.entries ?? aliceHistory.body.history ?? [];
    assert.equal(aliceEntries.length, 1);
    assert.ok(JSON.stringify(aliceHistory.body).includes(aliceLogline));
  });
});

// ---------------------------------------------------------------- (c)

test("[craft-invariants] prompt assembly reads accepted twists through the per-user namespace (source scan)", () => {
  const source = fs.readFileSync(new URL("../index.js", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /getAcceptedTwistsForProject\(\{\s*persistence,\s*projectId\s*\}\)/,
    "index.js must not read accepted twists by the raw body projectId",
  );
  assert.match(
    source,
    /getAcceptedTwistsForProject\(\{\s*persistence,\s*projectId:\s*craftStorageProjectId\(userId,\s*projectId\),?\s*\}\)/,
    "index.js must scope the prompt-wire twist read with craftStorageProjectId(userId, projectId)",
  );
});
