import assert from "node:assert/strict";
import { test } from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

async function signup(server, email) {
  const r = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: { email, password: "account-wiring-password-123" },
  });
  assert.equal(r.status, 201, `signup failed: ${r.text}`);
  const token = String(r.json?.access_token || "");
  const userId = String(r.json?.user?.user_id || "");
  assert.ok(token, "signup returns access token");
  assert.ok(userId, "signup returns user id");
  return { token, userId };
}

test("[account-wiring] export reads real persistence and delete revokes sessions", async () => {
  const server = await startBackend();
  try {
    const { token, userId } = await signup(server, "account-wiring@example.com");

    const created = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      json: { title: "Account Export Picture" },
    });
    assert.equal(created.status, 201, created.text);
    const projectId = String(created.json?.project_id || created.json?.project?.id || "");
    assert.ok(projectId, "screenplay project should be created");

    const exported = await apiRequest(server, "/account/export", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.equal(exported.status, 200, exported.text);
    assert.equal(exported.json?.schema, "io.them.account_export.v1");
    assert.equal(exported.json?.user_id, userId);
    assert.match(
      exported.headers.get("content-disposition") || "",
      new RegExp(`io-them-export-${userId}\\.json`)
    );
    const screenplayRows = exported.json?.domains?.screenplay || [];
    assert.ok(
      screenplayRows.some((row) => JSON.stringify(row).includes(projectId)),
      "account export should include the user's persisted screenplay project"
    );

    const deniedDelete = await apiRequest(server, "/account", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
      json: { reason: "missing reauth proof" },
    });
    assert.equal(deniedDelete.status, 403, "delete should require a fresh reauth proof");
    assert.equal(deniedDelete.json?.error, "reauth_required");

    const stillSignedIn = await apiRequest(server, "/auth/sessions", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.equal(stillSignedIn.status, 200, "failed delete must not revoke the active session");

    const deleted = await apiRequest(server, "/account", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
      json: { reason: "test cleanup", password: "account-wiring-password-123" },
    });
    assert.equal(deleted.status, 202, deleted.text);
    assert.equal(deleted.json?.status, "pending_deletion");
    assert.ok(deleted.json?.hard_delete_at, "delete response includes scheduled hard-delete date");

    const sessions = await apiRequest(server, "/auth/sessions", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.equal(sessions.status, 401, "delete request should revoke the active session");
  } finally {
    await server.stop();
  }
});
