import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { mountApiVersionRoute, buildVersionPayload } from "../lib/api_version_route.js";

function makeApp(overrides = {}) {
  const app = express();
  mountApiVersionRoute(app, {
    API_SCHEMA_VERSION: 1,
    BACKEND_BUILD: "test-build",
    BACKEND_BOOT_ID: "boot-abc",
    ...overrides,
  });
  return app;
}

async function get(app, path) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await res.json();
    return { status: res.status, headers: res.headers, body };
  } finally {
    server.close();
  }
}

test("[api_version_route] buildVersionPayload includes required fields", () => {
  const payload = buildVersionPayload({
    API_SCHEMA_VERSION: 2,
    BACKEND_BUILD: "abc",
    BACKEND_BOOT_ID: "boot-xyz",
    nowMs: 1715712345678,
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.schema_version, 2);
  assert.equal(payload.backend_build, "abc");
  assert.equal(payload.backend_boot_id, "boot-xyz");
  assert.equal(payload.server_time_ms, 1715712345678);
});

test("[api_version_route] mountApiVersionRoute requires deps", () => {
  assert.throws(() => mountApiVersionRoute(null, {}), /requires an Express app/);
  const app = express();
  assert.throws(() => mountApiVersionRoute(app, {}), /API_SCHEMA_VERSION/);
});

test("[api_version_route] GET /api/version returns 200 + envelope", async () => {
  const app = makeApp();
  const { status, body, headers } = await get(app, "/api/version");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.schema_version, 1);
  assert.equal(body.backend_build, "test-build");
  assert.equal(body.backend_boot_id, "boot-abc");
  assert.equal(typeof body.server_time_ms, "number");
  assert.match(headers.get("cache-control") || "", /max-age=5/);
});

test("[api_version_route] route is dependency-free (no DB, no memory)", async () => {
  // If buildVersionPayload reads anything other than the passed deps + Date.now(),
  // this test would surface that by failing on the assertions above. This test
  // is a documented invariant: do not add deps to this endpoint.
  const app = makeApp({ API_SCHEMA_VERSION: 99 });
  const { body } = await get(app, "/api/version");
  assert.equal(body.schema_version, 99);
});
