import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function signup(server) {
  const response = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: {
      email: `outline-cas-${randomUUID()}@example.test`,
      password: `Outline-${randomUUID()}-aA1!`,
      display_name: "Outline CAS Test",
    },
  });
  assert.equal(response.status, 201, response.text);
  return String(response.json?.access_token || "");
}

function protectedOutlineBody({ requestId, expectedRevision, label }) {
  return {
    client_request_id: requestId,
    expected_outline_revision: expectedRevision,
    acts: [{ id: "act-1", title: label, createdAt: 1, updatedAt: 2 }],
    scenes: [{
      id: "scene-1",
      title: "The room",
      slugline: "INT. ROOM - DAY",
      actId: "act-1",
      createdAt: 3,
      updatedAt: 4,
    }],
    beats: [{
      id: "beat-1",
      label: "Reveal",
      actId: "act-1",
      sceneId: "scene-1",
      createdAt: 5,
      updatedAt: 6,
    }],
  };
}

test("[screenplay-outline-cas] receipts survive restart and concurrent writers choose one winner", async () => {
  let server = await startBackend();
  const dataDir = server.dataDir;
  let token = "";
  const projectId = `outline-cas-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const firstBody = protectedOutlineBody({
    requestId: "outline-cas-first",
    expectedRevision: 0,
    label: "First committed outline",
  });

  try {
    token = await signup(server);
    const headers = authHeaders(token);
    const created = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers,
      json: { project_id: projectId, title: "Outline CAS Project", activate: true },
    });
    assert.equal(created.status, 201, created.text);

    const first = await apiRequest(server, `/screenplay/projects/${projectId}/outline`, {
      method: "POST",
      headers,
      json: firstBody,
    });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.json?.status, "saved");
    assert.equal(first.json?.outline_revision, 1);

    const replay = await apiRequest(server, `/screenplay/projects/${projectId}/outline`, {
      method: "POST",
      headers,
      json: firstBody,
    });
    assert.equal(replay.status, 200, replay.text);
    assert.equal(replay.json?.status, "replayed");
    assert.equal(replay.json?.outline_revision, 1);
  } finally {
    const stopped = await server.stop();
    assert.equal(stopped.forced, false, "backend should drain cleanly on SIGTERM");
  }

  server = await startBackend({ dataDir });
  try {
    const headers = authHeaders(token);
    const replayAfterRestart = await apiRequest(server, `/screenplay/projects/${projectId}/outline`, {
      method: "POST",
      headers,
      json: firstBody,
    });
    assert.equal(replayAfterRestart.status, 200, replayAfterRestart.text);
    assert.equal(replayAfterRestart.json?.status, "replayed");
    assert.equal(replayAfterRestart.json?.outline_revision, 1);
    assert.equal(replayAfterRestart.json?.outline?.acts?.[0]?.title, "First committed outline");
    assert.deepEqual(replayAfterRestart.json?.outline?.acts?.[0]?.scene_ids, ["scene-1"]);
    assert.equal(replayAfterRestart.json?.outline?.scenes?.[0]?.slugline, "INT. ROOM - DAY");
    assert.equal(replayAfterRestart.json?.outline?.scenes?.[0]?.act_id, "act-1");
    assert.deepEqual(replayAfterRestart.json?.outline?.scenes?.[0]?.beat_ids, ["beat-1"]);
    assert.equal(replayAfterRestart.json?.outline?.beats?.[0]?.scene_id, "scene-1");
    assert.ok(Number(replayAfterRestart.json?.outline?.acts?.[0]?.created_at || 0) > 1_000_000);

    const roundTripProjectId = `outline-roundtrip-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const roundTripCreated = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers,
      json: { project_id: roundTripProjectId, title: "Outline Round Trip" },
    });
    assert.equal(roundTripCreated.status, 201, roundTripCreated.text);
    const invalidOrderSeed = protectedOutlineBody({
      requestId: "outline-roundtrip-seed",
      expectedRevision: 0,
      label: "Round-trip seed",
    });
    invalidOrderSeed.acts[0].order = 1.5;
    invalidOrderSeed.scenes[0].order = Number.MAX_SAFE_INTEGER + 1;
    invalidOrderSeed.beats[0].order = "not-a-number";
    const roundTripSeed = await apiRequest(server, `/screenplay/projects/${roundTripProjectId}/outline`, {
      method: "POST",
      headers,
      json: invalidOrderSeed,
    });
    assert.equal(roundTripSeed.status, 200, roundTripSeed.text);
    assert.equal(roundTripSeed.json?.outline?.acts?.[0]?.order, 0);
    assert.equal(roundTripSeed.json?.outline?.scenes?.[0]?.order, 0);
    assert.equal(roundTripSeed.json?.outline?.beats?.[0]?.order, 0);
    const roundTripGet = await apiRequest(server, `/screenplay/projects/${roundTripProjectId}/outline`, {
      headers,
    });
    assert.equal(roundTripGet.status, 200, roundTripGet.text);
    const responseShapedSave = await apiRequest(
      server,
      `/screenplay/projects/${roundTripProjectId}/outline`,
      {
        method: "POST",
        headers,
        json: {
          client_request_id: "outline-roundtrip-response-shape",
          expected_outline_revision: 1,
          acts: roundTripGet.json?.outline?.acts,
          scenes: roundTripGet.json?.outline?.scenes,
          beats: roundTripGet.json?.outline?.beats,
        },
      }
    );
    assert.equal(responseShapedSave.status, 200, responseShapedSave.text);
    assert.deepEqual(responseShapedSave.json?.outline?.acts?.[0]?.scene_ids, ["scene-1"]);
    assert.equal(responseShapedSave.json?.outline?.scenes?.[0]?.act_id, "act-1");
    assert.deepEqual(responseShapedSave.json?.outline?.scenes?.[0]?.beat_ids, ["beat-1"]);
    assert.equal(responseShapedSave.json?.outline?.beats?.[0]?.scene_id, "scene-1");

    const changedReuse = await apiRequest(server, `/screenplay/projects/${projectId}/outline`, {
      method: "POST",
      headers,
      json: { ...firstBody, acts: [{ id: "act-1", title: "Changed reuse" }] },
    });
    assert.equal(changedReuse.status, 409, changedReuse.text);
    assert.equal(changedReuse.json?.error, "screenplay_outline_client_request_id_reused");

    const [raceA, raceB] = await Promise.all([
      apiRequest(server, `/screenplay/projects/${projectId}/outline`, {
        method: "POST",
        headers,
        json: protectedOutlineBody({
          requestId: "outline-cas-race-a",
          expectedRevision: 1,
          label: "Race A",
        }),
      }),
      apiRequest(server, `/screenplay/projects/${projectId}/outline`, {
        method: "POST",
        headers,
        json: protectedOutlineBody({
          requestId: "outline-cas-race-b",
          expectedRevision: 1,
          label: "Race B",
        }),
      }),
    ]);
    assert.deepEqual([raceA.status, raceB.status].sort(), [200, 409]);

    const fetched = await apiRequest(server, `/screenplay/projects/${projectId}/outline`, { headers });
    assert.equal(fetched.status, 200, fetched.text);
    assert.equal(fetched.json?.outline_revision, 2);
    assert.equal(fetched.json?.outline?.revision, 2);

    const superseded = await apiRequest(server, `/screenplay/projects/${projectId}/outline`, {
      method: "POST",
      headers,
      json: firstBody,
    });
    assert.equal(superseded.status, 409, superseded.text);
    assert.equal(superseded.json?.error, "screenplay_outline_replayed_superseded");
    assert.equal(superseded.json?.outline_revision, 2);

    const scene = await apiRequest(server, `/screenplay/projects/${projectId}/scenes`, {
      method: "POST",
      headers,
      json: { scene: { id: "scene-2", heading: "EXT. STREET - NIGHT" } },
    });
    assert.equal(scene.status, 200, scene.text);
    assert.equal(scene.json?.outline_revision, 3);

    const staleAfterScene = await apiRequest(server, `/screenplay/projects/${projectId}/outline`, {
      method: "POST",
      headers,
      json: protectedOutlineBody({
        requestId: "outline-cas-stale-after-scene",
        expectedRevision: 2,
        label: "Would overwrite the scene",
      }),
    });
    assert.equal(staleAfterScene.status, 409, staleAfterScene.text);
    assert.equal(staleAfterScene.json?.error, "stale_screenplay_outline_revision");
    assert.equal(staleAfterScene.json?.outline_revision, 3);
  } finally {
    const stopped = await server.stop();
    assert.equal(stopped.forced, false, "backend should drain cleanly on SIGTERM");
  }
});
