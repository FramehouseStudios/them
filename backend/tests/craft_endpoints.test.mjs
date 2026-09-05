// HTTP integration tests for /craft/* endpoints.
// Mounts craft routes onto a minimal Express app per test so we
// avoid env coupling to the full backend boot path.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import { mountCraftRoutes } from "../lib/craft_routes.js";
import {
  CRAFT_SCHEMA_VERSION,
  REPORT_SCHEMA,
  FRAMEWORK_SCHEMA,
  validateAgainstSchema,
} from "../lib/craft_schemas.js";
import {
  _resetCraftStores,
  configureCraftAnalysis,
} from "../lib/craft_analysis.js";
import { configureLoglineDistiller } from "../lib/logline_distiller.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshPersistenceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "io-them-craft-"));
}

async function withTestServer(
  fn,
  {
    mockUser = { id: "craft-route-test-user" },
    persistenceRoot = null,
    craftDeps = { authorizeProjectAccess: async () => true },
  } = {},
) {
  // T22: each test runs against a fresh JSON persistence root so writes
  // don't leak between tests.
  const root = persistenceRoot || freshPersistenceRoot();
  _resetCraftStores();
  const sharedTestPersistence = createJsonPersistence({ jsonRoot: root });
  configureCraftAnalysis({ persistence: sharedTestPersistence });
  configureLoglineDistiller({ persistence: sharedTestPersistence, classifier: null });
  const app = express();
  app.use(express.json());
  if (mockUser) {
    app.use((req, _res, next) => {
      req.authUser = mockUser;
      req.userId = mockUser.id;
      next();
    });
  }
  mountCraftRoutes(app, craftDeps);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL, persistenceRoot: root });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, path, headers = {}) {
  const r = await fetch(`${baseURL}${path}`, { headers });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

async function postJson(baseURL, path, payload, headers = {}) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

async function del(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`, { method: "DELETE" });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

// ---------- mount-time authentication/ownership contract ----------

test("mountCraftRoutes rejects missing, partial, and invalid wiring before registering routes", () => {
  const productionDeps = {
    requireAuthenticatedUser: (req) => req.authUser,
    getOrCreateScreenplayOwnerRecord: () => ({}),
    getScreenplayProjectRecord: () => null,
  };
  const cases = [
    ["omitted dependencies", undefined, /getOrCreateScreenplayOwnerRecord is required/],
    ["empty dependencies", {}, /getOrCreateScreenplayOwnerRecord is required/],
    ["auth alone", { requireAuthenticatedUser: productionDeps.requireAuthenticatedUser }, /getOrCreateScreenplayOwnerRecord is required/],
    ["owner lookup alone", { getOrCreateScreenplayOwnerRecord: productionDeps.getOrCreateScreenplayOwnerRecord }, /getScreenplayProjectRecord is required/],
    ["project lookup alone", { getScreenplayProjectRecord: productionDeps.getScreenplayProjectRecord }, /getOrCreateScreenplayOwnerRecord is required/],
    ...[null, false, "auth", {}].map((invalid) => [
      `invalid auth ${JSON.stringify(invalid)}`,
      { ...productionDeps, requireAuthenticatedUser: invalid },
      /requireAuthenticatedUser is required and must be a function/,
    ]),
    ...[true, "authorize", {}].map((invalid) => [
      `invalid focused authorizer ${JSON.stringify(invalid)}`,
      { ...productionDeps, authorizeProjectAccess: invalid },
      /authorizeProjectAccess must be a function when provided/,
    ]),
    ...["getOrCreateScreenplayOwnerRecord", "getScreenplayProjectRecord"].flatMap((name) => (
      [null, undefined, false, "lookup", {}].map((invalid) => [
        `invalid ${name} ${JSON.stringify(invalid)}`,
        { ...productionDeps, [name]: invalid },
        new RegExp(`${name} is required`),
      ])
    )),
  ];

  for (const [label, deps, expectedError] of cases) {
    const registrations = [];
    const app = Object.fromEntries(["use", "get", "post", "delete"].map((method) => [
      method, (...args) => registrations.push({ method, args }),
    ]));
    assert.throws(() => mountCraftRoutes(app, deps), expectedError, label);
    assert.deepEqual(registrations, [], `${label} must fail before any route or middleware is mounted`);
  }
});

test("production-shaped craft dependencies preserve canonical auth and read-only ownership checks", async () => {
  const calls = [];
  const owner = { userId: "craft-route-test-user" };
  const craftDeps = {
    requireAuthenticatedUser(req, _res, stage) {
      assert.equal(stage, "craft_auth");
      return req.authUser;
    },
    getOrCreateScreenplayOwnerRecord(req, options) {
      assert.equal(req.userId, owner.userId);
      assert.deepEqual(options, { create: false });
      return owner;
    },
    getScreenplayProjectRecord(receivedOwner, projectId) {
      assert.equal(receivedOwner, owner);
      calls.push(projectId);
      return projectId === "owned-project" ? { id: projectId } : null;
    },
  };
  await withTestServer(async ({ baseURL }) => {
    const created = await postJson(baseURL, "/craft/analyze", {
      projectId: "owned-project",
      versionId: "v1",
      frameworkId: "save-the-cat",
      screenplay: { pageCount: 110 },
      userId: "forged-user",
    }, { "X-User-Id": "forged-user" });
    assert.equal(created.status, 200);
    const fetched = await get(baseURL, "/craft/reports/owned-project/v1");
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.id, created.body.id);
    const denied = await get(baseURL, "/craft/reports/another-users-project/v1");
    assert.equal(denied.status, 404);
    assert.deepEqual(denied.body, { stage: "craft_project", error: "project_not_found" });
  }, { craftDeps });
  assert.deepEqual(calls, ["owned-project", "owned-project", "another-users-project"]);
});

test("focused craft authorizer supports allow/deny without replacing canonical authentication", async () => {
  const calls = [];
  const craftDeps = {
    async authorizeProjectAccess({ req, userId, projectId }) {
      assert.equal(req.authUser.id, "craft-route-test-user");
      assert.equal(userId, req.authUser.id);
      calls.push(projectId);
      if (projectId === "allow-boolean") return true;
      if (projectId === "allow-project") return { id: projectId };
      return false;
    },
  };
  await withTestServer(async ({ baseURL }) => {
    for (const projectId of ["allow-boolean", "allow-project"]) {
      const allowed = await get(baseURL, `/craft/reports/${projectId}/v1`, { "X-User-Id": "forged-user" });
      assert.equal(allowed.status, 404);
      assert.equal(allowed.body.error, "craft_report_not_found");
    }
    const denied = await get(baseURL, "/craft/reports/denied/v1");
    assert.equal(denied.status, 404);
    assert.deepEqual(denied.body, { stage: "craft_project", error: "project_not_found" });
  }, { craftDeps });
  assert.deepEqual(calls, ["allow-boolean", "allow-project", "denied"]);

  await withTestServer(async ({ baseURL }) => {
    for (const pathname of ["/craft/frameworks", "/craft/frameworks/save-the-cat", "/craft/schemas/report", "/craft/schemas/framework"]) {
      assert.equal((await get(baseURL, pathname)).status, 200);
    }
    const denied = await get(baseURL, "/craft/reports/allow-boolean/v1", { "X-User-Id": "forged-user" });
    assert.equal(denied.status, 401);
    assert.deepEqual(denied.body, { stage: "craft_auth", error: "user_auth_required" });
    const mutation = await postJson(baseURL, "/craft/frameworks", {});
    assert.equal(mutation.status, 401);
  }, { mockUser: null, craftDeps });
  assert.deepEqual(calls, ["allow-boolean", "allow-project", "denied"], "anonymous requests must never reach the authorizer");
});

// ---------- success shapes ----------

test("GET /craft/frameworks lists known frameworks with schemaVersion", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/frameworks");
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, CRAFT_SCHEMA_VERSION);
    assert.ok(Array.isArray(body.frameworks));
    assert.ok(body.frameworks.length >= 4);
    const ids = body.frameworks.map((f) => f.id).sort();
    assert.deepEqual(ids, ["hero-journey", "save-the-cat", "story-circle", "three-act"]);
    for (const ref of body.frameworks) {
      assert.ok(ref.id);
      assert.ok(ref.title);
    }
  });
});

test("GET /craft/frameworks remains available without user auth", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/frameworks");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.frameworks));
  }, { mockUser: null });
});

test("GET /craft/frameworks/:id returns full framework matching schema", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/frameworks/save-the-cat");
    assert.equal(status, 200);
    const v = validateAgainstSchema(body, FRAMEWORK_SCHEMA);
    assert.ok(v.valid, `framework should validate: ${v.errors.join("; ")}`);
    assert.equal(body.id, "save-the-cat");
    assert.deepEqual(body.requiredMajorTurnIds.sort(), ["all-is-lost", "catalyst", "finale", "midpoint"]);
  });
});

test("GET /craft/frameworks/:id returns new framework definitions", async () => {
  await withTestServer(async ({ baseURL }) => {
    const story = await get(baseURL, "/craft/frameworks/story-circle");
    assert.equal(story.status, 200);
    assert.equal(story.body.id, "story-circle");
    assert.deepEqual(story.body.requiredMajorTurnIds, ["need", "go", "find", "return-changed"]);
    assert.equal(story.body.beats.length, 8);
    assert.ok(validateAgainstSchema(story.body, FRAMEWORK_SCHEMA).valid);

    const hero = await get(baseURL, "/craft/frameworks/hero-journey");
    assert.equal(hero.status, 200);
    assert.equal(hero.body.id, "hero-journey");
    assert.deepEqual(hero.body.requiredMajorTurnIds, ["call-to-adventure", "crossing-first-threshold", "ordeal", "resurrection"]);
    assert.equal(hero.body.beats.length, 12);
    assert.ok(validateAgainstSchema(hero.body, FRAMEWORK_SCHEMA).valid);
  });
});

test("GET /craft/schemas/report returns the Report JSON Schema", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/schemas/report");
    assert.equal(status, 200);
    assert.equal(body.$id, REPORT_SCHEMA.$id);
    assert.equal(body.type, "object");
    assert.ok(Array.isArray(body.required));
    assert.ok(body.required.includes("schemaVersion"));
  });
});

test("GET /craft/schemas/framework returns the Framework JSON Schema", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/schemas/framework");
    assert.equal(status, 200);
    assert.equal(body.$id, FRAMEWORK_SCHEMA.$id);
    assert.equal(body.type, "object");
    assert.ok(body.required.includes("requiredMajorTurnIds"));
  });
});

test("Craft fails closed for an unauthenticated non-static route", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/format/lint", {
      text: "INT. KITCHEN - NIGHT",
    });
    assert.equal(status, 401);
    assert.equal(body.stage, "craft_auth");
    assert.equal(body.error, "user_auth_required");
  }, { mockUser: null });
});

test("POST /craft/analyze + GET /craft/reports/:projectId/:versionId roundtrip", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/analyze", {
      projectId: "proj-int-1",
      versionId: "v1",
      frameworkId: "save-the-cat",
      screenplay: { pageCount: 110, title: "Integration Test" },
    });
    assert.equal(status, 200);
    const v = validateAgainstSchema(body, REPORT_SCHEMA);
    assert.ok(v.valid, `report should validate: ${v.errors.join("; ")}`);
    assert.equal(body.projectId, "proj-int-1");
    assert.equal(body.coverage.complete, true);
    assert.equal(body.majorTurns.length, 4);

    const fetched = await get(baseURL, "/craft/reports/proj-int-1/v1");
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.id, body.id);
  });
});

test("POST /craft/overrides records and returns an override", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/overrides", {
      turnId: "all-is-lost",
      action: "mark-present",
      reason: "writer flagged scene",
      sceneId: "s048",
      page: 73,
      userId: "user-7",
    });
    assert.equal(status, 200);
    assert.equal(body.turnId, "all-is-lost");
    assert.equal(body.action, "mark-present");
    assert.equal(body.userId, "craft-route-test-user");
    assert.ok(body.id);
    assert.ok(body.createdAt);
  });
});

test("DELETE /craft/overrides/:id removes an override", async () => {
  await withTestServer(async ({ baseURL }) => {
    const created = await postJson(baseURL, "/craft/overrides", {
      turnId: "midpoint",
      action: "mark-present",
      userId: "user-9",
    });
    assert.equal(created.status, 200);
    const id = created.body.id;
    const deleted = await del(baseURL, `/craft/overrides/${id}`);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body, { ok: true });
    const second = await del(baseURL, `/craft/overrides/${id}`);
    assert.equal(second.status, 404);
    assert.equal(second.body.error, "craft_override_not_found");
  });
});

// ---------- failure shapes ----------

test("GET /craft/frameworks/:id returns craft_framework_not_found for unknown id", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/frameworks/does-not-exist");
    assert.equal(status, 404);
    assert.equal(body.error, "craft_framework_not_found");
  });
});

test("GET /craft/reports/:projectId returns craft_report_not_found when no analysis exists", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/reports/proj-missing/v1");
    assert.equal(status, 404);
    assert.equal(body.error, "craft_report_not_found");
  });
});

test("POST /craft/analyze rejects unknown frameworkId with craft_invalid_framework_id", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/analyze", {
      projectId: "p",
      frameworkId: "fake-framework",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_framework_id");
  });
});

test("POST /craft/analyze rejects missing projectId with craft_invalid_screenplay", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/analyze", {
      frameworkId: "save-the-cat",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_screenplay");
  });
});

test("X-Craft-Schema-Version header > server version returns craft_schema_version_unsupported", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/frameworks", {
      "x-craft-schema-version": String(CRAFT_SCHEMA_VERSION + 1),
    });
    assert.equal(status, 400);
    assert.equal(body.error, "craft_schema_version_unsupported");
  });
});

test("POST /craft/overrides ignores caller-supplied userId and stores canonical identity", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await postJson(baseURL, "/craft/overrides", {
        turnId: "midpoint",
        action: "mark-present",
        userId: "user-impostor",
      });
      assert.equal(status, 200);
      assert.equal(body.userId, "user-real");
      assert.notEqual(body.userId, "user-impostor");
    },
    { mockUser: { id: "user-real" } },
  );
});

// ---------- T22: persistence proof ----------

test("[T22] reports survive a simulated process restart via persistence", async () => {
  const sharedRoot = freshPersistenceRoot();

  // First "process": write a report.
  let writtenId;
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await postJson(baseURL, "/craft/analyze", {
        projectId: "persistence-proof",
        versionId: "v1",
        frameworkId: "save-the-cat",
        screenplay: { pageCount: 110, title: "Persistence Proof" },
      });
      assert.equal(status, 200);
      writtenId = body.id;
    },
    { persistenceRoot: sharedRoot },
  );

  // Second "process": same persistence root, fresh in-memory state.
  // The in-memory cache that existed in the first process is gone,
  // but the report on disk under sharedRoot must be retrievable.
  await withTestServer(
    async ({ baseURL }) => {
      const fetched = await get(baseURL, "/craft/reports/persistence-proof/v1");
      assert.equal(fetched.status, 200);
      assert.equal(fetched.body.id, writtenId);
    },
    { persistenceRoot: sharedRoot },
  );
});

test("[T22] overrides survive a simulated process restart via persistence", async () => {
  const sharedRoot = freshPersistenceRoot();

  // First "process": create an override.
  let overrideId;
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await postJson(baseURL, "/craft/overrides", {
        turnId: "all-is-lost",
        action: "mark-present",
        reason: "writer-flagged",
        sceneId: "s048",
        page: 73,
        userId: "user-7",
      });
      assert.equal(status, 200);
      overrideId = body.id;
      // T22 uses UUID-based override ids.
      assert.match(overrideId, /^ov_/);
    },
    { persistenceRoot: sharedRoot },
  );

  // Second "process": delete the override. If persistence is genuinely
  // doing the work, the override is found and deletion succeeds; the
  // first delete returns 200, the second returns 404.
  await withTestServer(
    async ({ baseURL }) => {
      const first = await del(baseURL, `/craft/overrides/${overrideId}`);
      assert.equal(first.status, 200);
      assert.deepEqual(first.body, { ok: true });
      const second = await del(baseURL, `/craft/overrides/${overrideId}`);
      assert.equal(second.status, 404);
      assert.equal(second.body.error, "craft_override_not_found");
    },
    { persistenceRoot: sharedRoot },
  );
});

// ---------- T-format-linter ----------

test("[format-linter] POST /craft/format/lint returns suggestions for malformed input", async () => {
  await withTestServer(async ({ baseURL }) => {
    const text = `INT KITCHEN NIGHT\n\nJune\nHello.\n`;
    const { status, body } = await postJson(baseURL, "/craft/format/lint", { text });
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.ruleSetVersion, "v1");
    assert.ok(body.totalSuggestions >= 2);
    const ruleSet = new Set(body.suggestions.map((s) => s.rule));
    assert.ok(ruleSet.has("scene_heading_shape"));
    assert.ok(ruleSet.has("character_cue_caps"));
  });
});

test("[format-linter] POST /craft/format/lint returns empty for well-formed input", async () => {
  await withTestServer(async ({ baseURL }) => {
    const text = `INT. KITCHEN - NIGHT\n\nJUNE\nHello.\n`;
    const { status, body } = await postJson(baseURL, "/craft/format/lint", { text });
    assert.equal(status, 200);
    assert.equal(body.totalSuggestions, 0);
    assert.deepEqual(body.bySeverity, { hard: 0, medium: 0, soft: 0 });
  });
});

test("[format-linter] POST /craft/format/lint requires text", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/format/lint", {});
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_screenplay");
  });
});

test("[T22] override IDs are UUID-shaped (survive restart)", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r1 = await postJson(baseURL, "/craft/overrides", {
      turnId: "midpoint", action: "mark-present", userId: "u1",
    });
    const r2 = await postJson(baseURL, "/craft/overrides", {
      turnId: "midpoint", action: "mark-present", userId: "u1",
    });
    assert.notEqual(r1.body.id, r2.body.id);
    // Both should have the ov_<uuid> shape.
    assert.match(r1.body.id, /^ov_[0-9a-f-]{36}$/);
    assert.match(r2.body.id, /^ov_[0-9a-f-]{36}$/);
  });
});

// ---------- T-logline-distiller ----------

test("[logline-distiller] POST /craft/logline/distill returns a logline and persists it", async () => {
  await withTestServer(async ({ baseURL }) => {
    const text =
      "INT. KITCHEN - NIGHT\n\nJUNE\nI can't keep doing this.\n";
    const { status, body } = await postJson(baseURL, "/craft/logline/distill", {
      text,
      projectId: "logline-proj-1",
      versionId: "v1",
      frameworkId: "save-the-cat",
    });
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, 1);
    assert.equal(typeof body.logline, "string");
    assert.ok(body.logline.length > 0);
    assert.equal(body.source, "stub");
    assert.equal(body.stored, true);
    assert.ok(body.distilledAt);
  });
});

test("[logline-distiller] POST /craft/logline/distill requires text", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/logline/distill", {
      projectId: "logline-proj-2",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_screenplay");
  });
});

test("[logline-distiller] POST /craft/logline/distill requires projectId", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/logline/distill", {
      text: "INT. ROOM - DAY\n\nJUNE\nHello.\n",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_screenplay");
  });
});

test("[logline-distiller] GET /craft/logline/history returns chrono-ordered entries", async () => {
  await withTestServer(async ({ baseURL }) => {
    const projectId = "logline-history-proj";
    await postJson(baseURL, "/craft/logline/distill", {
      text: "INT. KITCHEN - NIGHT\n\nJUNE\nFirst.\n",
      projectId,
      versionId: "v1",
    });
    // Small delay so distilledAt timestamps differ in the storage key.
    await new Promise((r) => setTimeout(r, 5));
    await postJson(baseURL, "/craft/logline/distill", {
      text: "EXT. ROOFTOP - DAWN\n\nMARCUS\nSecond.\n",
      projectId,
      versionId: "v2",
    });
    const { status, body } = await get(
      baseURL,
      `/craft/logline/history?projectId=${encodeURIComponent(projectId)}`,
    );
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.projectId, projectId);
    assert.ok(Array.isArray(body.entries));
    assert.equal(body.entries.length, 2);
    assert.ok(body.entries[0].distilledAtMs <= body.entries[1].distilledAtMs);
    assert.equal(body.entries[0].versionId, "v1");
    assert.equal(body.entries[1].versionId, "v2");
  });
});

test("[logline-distiller] GET /craft/logline/drift returns drift envelope after recorded entries", async () => {
  await withTestServer(async ({ baseURL }) => {
    const projectId = "logline-drift-proj";
    await postJson(baseURL, "/craft/logline/distill", {
      text: "INT. CABIN - NIGHT\n\nELLA\nWe're not safe here.\n",
      projectId,
      versionId: "v1",
    });
    const { status, body } = await get(
      baseURL,
      `/craft/logline/drift?projectId=${encodeURIComponent(projectId)}&currentLogline=${encodeURIComponent("A wholly different premise about commerce and lawyers.")}`,
    );
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, 1);
    assert.equal(typeof body.score, "number");
    assert.ok(body.score >= 0 && body.score <= 1);
    assert.ok(typeof body.summary === "string" && body.summary.length > 0);
    assert.equal(body.historyCount, 1);
    assert.ok(body.earliest);
  });
});

test("[logline-distiller] GET /craft/logline/drift returns empty-history envelope when no entries exist", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(
      baseURL,
      "/craft/logline/drift?projectId=no-history-yet",
    );
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.score, 0);
    assert.equal(body.historyCount, 0);
    assert.equal(body.earliest, "");
    assert.ok(body.summary);
  });
});

test("[logline-distiller] GET /craft/logline/history requires projectId", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/logline/history");
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_screenplay");
  });
});
