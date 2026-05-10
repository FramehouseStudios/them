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
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshPersistenceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "io-them-craft-"));
}

async function withTestServer(fn, { mockUser = null, persistenceRoot = null } = {}) {
  // T22: each test runs against a fresh JSON persistence root so writes
  // don't leak between tests.
  const root = persistenceRoot || freshPersistenceRoot();
  _resetCraftStores();
  configureCraftAnalysis({ persistence: createJsonPersistence({ jsonRoot: root }) });
  const app = express();
  app.use(express.json());
  if (mockUser) {
    app.use((req, _res, next) => {
      req.user = mockUser;
      next();
    });
  }
  mountCraftRoutes(app);
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

// ---------- success shapes ----------

test("GET /craft/frameworks lists known frameworks with schemaVersion", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/frameworks");
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, CRAFT_SCHEMA_VERSION);
    assert.ok(Array.isArray(body.frameworks));
    assert.ok(body.frameworks.length >= 2);
    const ids = body.frameworks.map((f) => f.id).sort();
    assert.deepEqual(ids, ["save-the-cat", "three-act"]);
    for (const ref of body.frameworks) {
      assert.ok(ref.id);
      assert.ok(ref.title);
    }
  });
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
    assert.equal(body.userId, "user-7");
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

test("POST /craft/overrides rejects userId mismatch when authenticated user is set", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await postJson(baseURL, "/craft/overrides", {
        turnId: "midpoint",
        action: "mark-present",
        userId: "user-impostor",
      });
      assert.equal(status, 403);
      assert.equal(body.error, "craft_override_user_mismatch");
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
