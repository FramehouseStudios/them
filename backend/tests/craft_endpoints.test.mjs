// HTTP integration tests for /craft/* endpoints.
// Mounts craft routes onto a minimal Express app per test so we
// avoid env coupling to the full backend boot path.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountCraftRoutes } from "../lib/craft_routes.js";
import {
  CRAFT_SCHEMA_VERSION,
  REPORT_SCHEMA,
  FRAMEWORK_SCHEMA,
  validateAgainstSchema,
} from "../lib/craft_schemas.js";
import { _resetCraftStores } from "../lib/craft_analysis.js";

async function withTestServer(fn, { mockUser = null } = {}) {
  _resetCraftStores();
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
    await fn({ baseURL });
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
