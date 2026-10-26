import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { startBackend, apiRequest } from "./helpers/backend_test_server.mjs";

const options = { unsetEnv: ["DATABASE_URL", "REDIS_URL"], env: { REQUIRE_USER_AUTH: "1" } };
const draft = "\r\nTitle: The Reel\r\n\r\nINT. CAFE - NIGHT\r\nCafe\u0301.\r\n\t ";
const bytes = value => Buffer.from(value, "utf8");
const initializePath = "/screenplay/projects/initialize";
const body = () => ({ project_id: `project-${randomUUID()}`, title: "The Reel", phase: "scene_draft",
  initial_draft: { draft, client_request_id: randomUUID() } });

async function writer(server) {
  const result = await apiRequest(server, "/auth/signup", { method: "POST", json: {
    email: `initial-${randomUUID()}@example.test`, password: "Initial-project-fixture-aA1!",
  } });
  assert.equal(result.status, 201);
  return { Authorization: `Bearer ${result.json.access_token || result.json.token}` };
}

test("initial project survives abrupt server restart, lost acknowledgement and concurrent retry exactly once", { timeout: 60000 }, async () => {
  let server = await startBackend(options);
  try {
    const headers = await writer(server), request = body();
    const send = () => apiRequest(server, initializePath, { method: "POST", headers, json: request });
    const results = await Promise.all([send(), send()]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 201]);
    assert.ok(results[0].json.version_id);
    assert.equal(results[0].json.version_id, results[1].json.version_id);
    const versionId = results[0].json.version_id;
    assert.deepEqual(bytes(results[0].json.version.draft), bytes(draft));
    // Discard the receipt from the client's perspective and abruptly stop only
    // this test's child. Replay must work from authoritative storage, not a map.
    const dataDir = server.dataDir, exited = once(server.child, "exit");
    assert.equal(server.child.kill("SIGKILL"), true);
    await exited;
    server = await startBackend({ ...options, dataDir });
    const replay = await send();
    assert.equal(replay.status, 200);
    assert.equal(replay.json.replayed, true);
    assert.equal(replay.json.version_id, versionId);
    assert.deepEqual(bytes(replay.json.version.draft), bytes(draft));
    const read = () => apiRequest(server, `/screenplay/projects/${request.project_id}?include_drafts=1`, { headers });
    const restored = await read();
    assert.equal(restored.status, 200);
    assert.equal(restored.json.project.versions.length, 1);
    assert.deepEqual(bytes(restored.json.project.versions[0].draft), bytes(draft));
    const list = await apiRequest(server, "/screenplay/projects", { headers });
    assert.equal(list.json.screenplay_projects.length, 1);
    assert.equal(list.json.screenplay_projects[0].id, request.project_id);
    const nextDraft = draft + "\r\nThe writer changes the ending. ";
    const next = await apiRequest(server, `/screenplay/projects/${request.project_id}/version`, {
      method: "POST", headers, json: { draft: nextDraft, base_version_id: versionId,
        client_request_id: "second-version", conflict_strategy: "reject_if_stale" },
    });
    assert.equal(next.status, 201);
    const late = await send();
    assert.equal(late.status, 409);
    assert.equal(late.json.error, "screenplay_initial_request_superseded");
    const final = await read();
    assert.equal(final.json.project.active_version_id, next.json.version_id);
    assert.equal(final.json.project.versions.length, 2);
    assert.deepEqual(bytes(final.json.project.versions[0].draft), bytes(nextDraft));
  } finally { await server.stop(); }
});

test("initial project requires server-authenticated ownership and keeps same project IDs isolated", { timeout: 60000 }, async () => {
  const server = await startBackend(options);
  try {
    const alice = await writer(server), bob = await writer(server), request = body();
    const anonymous = await apiRequest(server, initializePath, { method: "POST", json: request });
    assert.equal(anonymous.status, 401);
    const created = await apiRequest(server, initializePath, { method: "POST", headers: alice, json: request });
    assert.equal(created.status, 201);
    const foreign = await apiRequest(server, `/screenplay/projects/${request.project_id}?include_drafts=1`, { headers: bob });
    assert.equal(foreign.status, 404);
    assert.equal(JSON.stringify(foreign.json).includes("The Reel"), false);
    const other = await apiRequest(server, initializePath, { method: "POST", headers: bob,
      json: { ...request, title: "Bob's project", initial_draft: { ...request.initial_draft, draft: "Bob's exact words. " } } });
    assert.equal(other.status, 201);
    assert.notEqual(other.json.version_id, created.json.version_id);
    assert.equal(other.json.version.draft, "Bob's exact words. ");
    const untouched = await apiRequest(server, `/screenplay/projects/${request.project_id}?include_drafts=1`, { headers: alice });
    assert.deepEqual(bytes(untouched.json.project.versions[0].draft), bytes(draft));
  } finally { await server.stop(); }
});
