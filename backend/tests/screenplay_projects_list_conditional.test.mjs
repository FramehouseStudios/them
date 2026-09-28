import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

// Studio polls the project list every 15 s to notice other devices. An
// unchanged list answers 304 (no body) instead of the full JSON.
test("[screenplay-projects] unchanged list answers 304; a change answers 200", async () => {
  const server = await startBackend();
  try {
    const stamp = randomUUID().replace(/-/g, "");
    const signup = await apiRequest(server, "/auth/signup", {
      method: "POST",
      json: {
        email: `list-etag-${stamp}@example.test`,
        password: `List-etag-${stamp}-aA1!`,
        display_name: "List Etag Writer",
      },
    });
    assert.equal(signup.status, 201, signup.text);
    const token = String(signup.json?.access_token || signup.json?.token || "");
    const headers = { Authorization: `Bearer ${token}` };
    const listPath = "/screenplay/projects?limit=24&include_versions=0&include_drafts=0";

    const created = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers,
      json: { project_id: `etag-${stamp.slice(0, 10)}`, title: "Etag Feature", activate: true },
    });
    assert.equal(created.status, 201, created.text);

    const first = await apiRequest(server, listPath, { headers });
    assert.equal(first.status, 200, first.text);
    const etag = first.headers.get("etag");
    assert.ok(etag, "the list carries an ETag");

    const unchanged = await apiRequest(server, listPath, { headers: { ...headers, "If-None-Match": etag } });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.text, "");
    assert.equal(unchanged.headers.get("etag"), etag);

    const renamed = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers,
      json: { project_id: `etag2-${stamp.slice(0, 10)}`, title: "Second Feature" },
    });
    assert.equal(renamed.status, 201, renamed.text);

    const changed = await apiRequest(server, listPath, { headers: { ...headers, "If-None-Match": etag } });
    assert.equal(changed.status, 200, changed.text);
    assert.notEqual(changed.headers.get("etag"), etag);
    assert.equal(changed.json?.screenplay_projects?.length, 2);

    // Another account replaying this ETag gets its own list, never a 304.
    const other = await apiRequest(server, "/auth/signup", {
      method: "POST",
      json: {
        email: `list-etag-other-${stamp}@example.test`,
        password: `List-etag-other-${stamp}-aA1!`,
        display_name: "Other Writer",
      },
    });
    assert.equal(other.status, 201, other.text);
    const otherToken = String(other.json?.access_token || other.json?.token || "");
    const replay = await apiRequest(server, listPath, {
      headers: { Authorization: `Bearer ${otherToken}`, "If-None-Match": changed.headers.get("etag") },
    });
    assert.equal(replay.status, 200, replay.text);
    assert.equal(replay.json?.screenplay_projects?.length ?? 0, 0);
  } finally {
    await server.stop();
  }
});
