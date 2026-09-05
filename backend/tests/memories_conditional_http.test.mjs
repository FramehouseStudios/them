import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

test("[memories-conditional-http] empty validators return the authenticated full snapshot, not 304", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-memories-conditional-"));
  let server;
  t.after(async () => {
    try {
      if (server) await server.stop();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
  server = await startBackend({ dataDir });
  const signup = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: { email: "conditional-writer@example.test", password: "Writer-conditional-test-123!" },
  });
  assert.equal(signup.status, 201, signup.text);
  const accessToken = signup.json?.access_token;
  assert.ok(accessToken, "The fixture must authenticate through the real auth route.");
  const headers = { Authorization: `Bearer ${accessToken}` };
  // Materialize a durable account-memory row through its real mutation route.
  // A brand-new account otherwise receives an ephemeral empty-memory default.
  const seed = await apiRequest(server, "/tasks/update", {
    method: "POST",
    headers,
    json: { action: "add", title: "Revise the opening scene" },
  });
  assert.equal(seed.status, 200, seed.text);
  assert.equal(seed.json?.status, "created");
  const first = await apiRequest(server, "/memories", { headers });
  assert.equal(first.status, 200, first.text);
  const etag = first.headers.get("etag");
  assert.match(etag, /^W\/"memories_[a-f0-9]{32}"$/,
    "Exercise the real creative-memory list ETag, not an account-only validator stub.");
  assert.ok(Array.isArray(first.json?.memories));

  for (const validator of ['""', 'W/""', '"", "unseen"']) {
    const response = await apiRequest(server, "/memories", {
      headers: { ...headers, "If-None-Match": validator },
    });
    assert.equal(response.status, 200, `Empty validator ${validator} discarded the full response.`);
    assert.equal(response.json?.delta_no_change, false);
    assert.deepEqual(response.json?.memories, first.json.memories);
    assert.deepEqual(response.json?.story_move_preferences, first.json.story_move_preferences);
    assert.equal(response.headers.get("etag"), etag);
  }

  for (const validator of [etag, etag.replace(/^W\//, "")]) {
    const cached = await apiRequest(server, "/memories", {
      headers: { ...headers, "If-None-Match": validator },
    });
    assert.equal(cached.status, 304, "A real list ETag must still validate the cached snapshot.");
    assert.equal(cached.text, "");
    assert.equal(cached.headers.get("etag"), etag);
  }

  const unauthenticated = await apiRequest(server, "/memories", {
    headers: { "If-None-Match": etag },
  });
  assert.equal(unauthenticated.status, 401, "A validator must not bypass authentication.");
});
