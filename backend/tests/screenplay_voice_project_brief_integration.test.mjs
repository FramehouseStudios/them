import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function signup(server, email, password, displayName) {
  const response = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: { email, password, display_name: displayName },
  });
  assert.equal(response.status, 201, response.text);
  return String(response.json?.access_token || response.json?.token || "");
}

async function login(server, email, password) {
  const response = await apiRequest(server, "/auth/login", {
    method: "POST",
    json: { email, password },
  });
  assert.equal(response.status, 200, response.text);
  return String(response.json?.access_token || response.json?.token || "");
}

test("[voice-project-brief] authenticated receipt survives restart and competing devices see one winner", async () => {
  let server = await startBackend();
  const dataDir = server.dataDir;
  const stamp = randomUUID().replace(/-/g, "");
  const aliceEmail = `brief-alice-${stamp}@example.test`;
  const bobEmail = `brief-bob-${stamp}@example.test`;
  const password = `Brief-${stamp.slice(0, 12)}-aA1!`;
  const projectId = `brief-${stamp.slice(0, 12)}`;
  const request = {
    client_request_id: `brief-request-${stamp}`,
    expected_revision: 0,
    action: {
      type: "candidates",
      candidates: {
        genre: "science fiction",
        characters: ["Mara", "Eli", "JO", "Venn", "Cato"],
        locations: ["Orbital station", "Night market", "Flood tunnel"],
        story_clock: "The chase must finish before midnight.",
      },
    },
  };

  try {
    const aliceToken = await signup(server, aliceEmail, password, "Alice Brief Writer");
    const created = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers: authHeaders(aliceToken),
      json: { project_id: projectId, title: "Midnight Orbit", activate: true },
    });
    assert.equal(created.status, 201, created.text);
    const saved = await apiRequest(server, `/screenplay/projects/${projectId}/brief/turn`, {
      method: "POST",
      headers: authHeaders(aliceToken),
      json: request,
    });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.json?.status, "saved");
    assert.equal(saved.json?.brief?.title, "Midnight Orbit");

    const bobToken = await signup(server, bobEmail, password, "Bob Brief Writer");
    const crossOwner = await apiRequest(server, `/screenplay/projects/${projectId}/brief/turn`, {
      method: "POST",
      headers: authHeaders(bobToken),
      json: request,
    });
    const missing = await apiRequest(server, "/screenplay/projects/missing-project/brief/turn", {
      method: "POST",
      headers: authHeaders(aliceToken),
      json: request,
    });
    assert.equal(crossOwner.status, 404, crossOwner.text);
    assert.equal(missing.status, 404, missing.text);
    assert.equal(crossOwner.json?.error, missing.json?.error);
  } finally {
    const stopped = await server.stop();
    assert.equal(stopped.forced, false);
  }

  server = await startBackend({ dataDir });
  try {
    const aliceToken = await login(server, aliceEmail, password);
    const replay = await apiRequest(server, `/screenplay/projects/${projectId}/brief/turn`, {
      method: "POST",
      headers: authHeaders(aliceToken),
      json: request,
    });
    assert.equal(replay.status, 200, replay.text);
    assert.equal(replay.json?.status, "replayed");
    assert.deepEqual(replay.json?.brief?.fields?.characters?.value, ["Mara", "Eli", "JO", "Venn", "Cato"]);
    assert.deepEqual(replay.json?.brief?.fields?.locations?.value, ["Orbital station", "Night market", "Flood tunnel"]);

    const candidates = [
      {
        client_request_id: `brief-device-a-${stamp}`,
        expected_revision: 1,
        action: { type: "candidates", candidates: { tone: "urgent" } },
      },
      {
        client_request_id: `brief-device-b-${stamp}`,
        expected_revision: 1,
        action: { type: "candidates", candidates: { premise: "A courier races an orbital curfew." } },
      },
    ];
    const results = await Promise.all(candidates.map((json) => apiRequest(
      server,
      `/screenplay/projects/${projectId}/brief/turn`,
      { method: "POST", headers: authHeaders(aliceToken), json }
    )));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const winner = results.find((result) => result.status === 200);
    const stale = results.find((result) => result.status === 409);
    assert.equal(stale.json?.status, "stale_revision");
    assert.equal(stale.json?.brief_revision, 2);
    assert.deepEqual(stale.json?.brief, winner.json?.brief);
  } finally {
    const stopped = await server.stop();
    assert.equal(stopped.forced, false);
  }
});
