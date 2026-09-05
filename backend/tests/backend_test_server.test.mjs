import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createJsonPersistence } from "../lib/persistence_json.js";
import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

test("[backend-test-server] ambient external storage cannot override isolated JSON fixtures", async (t) => {
  const poisonedEnvironment = {
    DATABASE_URL: "postgres://ambient:poison@127.0.0.1:1/ambient_database",
    SCALE_POSTGRES_URL: "postgres://ambient:poison@127.0.0.1:1/ambient_scale",
    REDIS_URL: "redis://127.0.0.1:1/0",
    SCALE_REDIS_URL: "redis://127.0.0.1:1/1",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(poisonedEnvironment).map((key) => [key, process.env[key]])
  );
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-test-server-isolation-"));
  let server;
  t.after(async () => {
    try {
      if (server) {
        const stopped = await server.stop();
        assert.equal(stopped.forced, false, "isolated backend should drain cleanly");
      }
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
  Object.assign(process.env, poisonedEnvironment);

  server = await startBackend({
    dataDir,
    env: {
      APP_TOKEN: "isolated-explicit-app-token",
      BACKEND_BUILD: "isolated-explicit-build",
      SCALE_BACKPLANE_ENABLED: "1",
    },
  });
  for (const [key, value] of Object.entries(poisonedEnvironment)) {
    assert.equal(server.env[key], "", `${key} must not reach the JSON-fixture child`);
    assert.equal(process.env[key], value, "startBackend must not mutate its parent's environment");
  }
  assert.equal(server.env.APP_TOKEN, "isolated-explicit-app-token");
  assert.equal(server.env.PERSISTENCE_JSON_ROOT, path.join(dataDir, "persistence"));

  const health = await apiRequest(server, "/health");
  assert.equal(health.status, 200, health.text);
  assert.equal(health.json?.backend_build, "isolated-explicit-build");
  assert.equal(health.json?.scale_backplane?.redisEnabled, false);
  assert.equal(health.json?.scale_backplane?.postgresEnabled, false);

  const signup = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: {
      email: "test-server-isolation@example.test",
      password: "Isolated-test-server-password-123!",
    },
  });
  assert.equal(signup.status, 201, signup.text);
  const token = signup.json?.access_token || signup.json?.token;
  const userId = signup.json?.user?.user_id;
  assert.ok(token);
  assert.ok(userId);

  const projectId = "isolated-json-project";
  const created = await apiRequest(server, "/screenplay/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    json: { project_id: projectId, title: "Isolated JSON Feature" },
  });
  assert.equal(created.status, 201, created.text);

  const persistence = createJsonPersistence({ jsonRoot: server.env.PERSISTENCE_JSON_ROOT });
  try {
    const persisted = await persistence.get({ domain: "screenplay", key: `user:${userId}` });
    assert.ok(
      persisted?.projects?.some((project) => project.id === projectId),
      "the real backend must commit the project into the test's canonical JSON root"
    );
  } finally {
    await persistence.close();
  }
});
