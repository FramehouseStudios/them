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

test("[screenplay-cross-device] create intent replays after restart without metadata, selection or owner crossover", async () => {
  const env = { REQUIRE_USER_AUTH: "true", CLEMENTINE_MUSE_ENABLED: "0", KNOWLEDGE_RAG_EMBEDDINGS_ENABLED: "0" };
  let server = await startBackend({ env });
  const dataDir = server.dataDir;
  const stamp = randomUUID().replace(/-/g, "");
  const email = `create-${stamp}@example.test`, password = `Create-${stamp}-aA1!`;
  const id = randomUUID(), otherId = randomUUID();
  const raw = " \r\nINT. FIRST ROOM - NIGHT\r\nA cafe\u0301 door opens.\t ";
  let versionId;
  try {
    let headers = authHeaders(await signup(server, email, password, "Creation proof"));
    const create = () => apiRequest(server, `/screenplay/projects/${id}/creation`, {
      method: "PUT", headers, json: { title: "Original title", phase: "scene_draft" } });
    assert.equal((await apiRequest(server, `/screenplay/projects/${id}/creation`, {
      method: "PUT", json: { title: "Anonymous" } })).status, 401);
    const first = await create();
    assert.equal(first.status, 201, first.text);
    const seed = await apiRequest(server, `/screenplay/projects/${id}/version`, {
      method: "POST", headers, json: { draft: raw, source: "studio_initial_seed",
        client_request_id: "durable-first-scene", conflict_strategy: "reject_if_stale" } });
    assert.equal(seed.status, 201, seed.text);
    versionId = seed.json.version_id;
    assert.equal((await apiRequest(server, "/screenplay/projects", { method: "POST", headers,
      json: { project_id: otherId, title: "Other active project" } })).status, 201);
    assert.equal((await apiRequest(server, "/screenplay/projects", { method: "POST", headers,
      json: { project_id: id, title: "Later title", logline: "Later ideas", tags: ["keep"], activate: false } })).status, 200);
    assert.equal((await server.stop()).forced, false);
    server = await startBackend({ dataDir, env });
    headers = authHeaders(await login(server, email, password));
    const replay = await create();
    assert.equal(replay.status, 200, replay.text);
    assert.equal(replay.json.replayed, true);
    assert.equal(replay.json.project.title, "Later title");
    assert.equal(replay.json.project.logline, "Later ideas");
    assert.deepEqual(replay.json.project.tags, ["keep"]);
    assert.equal(replay.json.screenplay_active_project_id, otherId);
    assert.equal(replay.json.screenplay_project_count, 2);
    assert.equal(replay.json.project.versions.length, 1);
    assert.equal(replay.json.project.versions[0].draft, raw);
    const repeatedSeed = await apiRequest(server, `/screenplay/projects/${id}/version`, {
      method: "POST", headers, json: { draft: raw, source: "studio_initial_seed",
        client_request_id: "durable-first-scene", conflict_strategy: "reject_if_stale" } });
    assert.equal(repeatedSeed.status, 200, repeatedSeed.text);
    assert.equal(repeatedSeed.json.version_id, versionId);
    assert.equal(repeatedSeed.json.project.versions.length, 1);
    const stranger = authHeaders(await signup(server, `stranger-${stamp}@example.test`, password, "Other owner"));
    assert.equal((await apiRequest(server, `/screenplay/projects/${id}`, { headers: stranger })).status, 404);
    const isolated = await apiRequest(server, `/screenplay/projects/${id}/creation`, {
      method: "PUT", headers: stranger, json: { title: "Other owner's namespace" } });
    assert.equal(isolated.status, 201, isolated.text);
    assert.equal(isolated.json.project.versions.length, 0);
    const original = await apiRequest(server, `/screenplay/projects/${id}?include_drafts=1`, { headers });
    assert.equal(original.status, 200, original.text);
    assert.equal(original.json.project.title, "Later title");
    assert.equal(original.json.project.versions[0].draft, raw);
  } finally { await server.stop(); }
});

for (const source of ["studio_manual", "studio_snapshot"]) {
test(`[screenplay-cross-device] ${source} blank edits survive restart with exact retry and owner isolation`, async () => {
  let server = await startBackend({ env: { REQUIRE_USER_AUTH: "true" } });
  const dataDir = server.dataDir;
  const stamp = randomUUID().replace(/-/g, "");
  const email = `blank-writer-${stamp}@example.test`;
  const password = `Blank-writer-${stamp}-aA1!`;
  const projectId = `blank-${stamp.slice(0, 12)}`;
  const whitespace = " \t\r\n";
  let seedVersionId, emptyVersionId, blankVersionId;
  const request = (draft, base, id) => ({ draft, base_version_id: base,
    source, allow_empty_draft: true,
    conflict_strategy: "reject_if_stale", client_request_id: id });
  try {
    const token = await signup(server, email, password, "Blank Writer");
    const headers = authHeaders(token);
    const created = await apiRequest(server, "/screenplay/projects", { method: "POST", headers,
      json: { project_id: projectId, title: "Delete All Proof", activate: true } });
    assert.equal(created.status, 201, created.text);
    const seed = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST", headers, json: { draft: "Original writer text.", source: "studio_manual" } });
    assert.equal(seed.status, 201, seed.text);
    seedVersionId = seed.json.version_id;
    const empty = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST", headers, json: request("", seedVersionId, "delete-all-on-phone") });
    assert.equal(empty.status, 201, empty.text);
    assert.equal(empty.json.version.draft, "");
    assert.equal(empty.json.version.source, source);
    emptyVersionId = empty.json.version_id;
    const blank = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST", headers, json: request(whitespace, emptyVersionId, "whitespace-on-phone") });
    assert.equal(blank.status, 201, blank.text);
    assert.equal(blank.json.version.draft, whitespace);
    blankVersionId = blank.json.version_id;
    const unsigned = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST", json: request("", blankVersionId, "unsigned-delete") });
    assert.equal(unsigned.status, 401, unsigned.text);
  } finally {
    assert.equal((await server.stop()).forced, false);
  }
  server = await startBackend({ dataDir, env: { REQUIRE_USER_AUTH: "true" } });
  try {
    const headers = authHeaders(await login(server, email, password));
    const read = () => apiRequest(server, `/screenplay/projects/${projectId}?include_drafts=1`, { headers });
    const detail = await read();
    assert.equal(detail.status, 200, detail.text);
    assert.equal(detail.json.project.active_version_id, blankVersionId);
    const versions = detail.json.project.versions;
    assert.equal(versions.length, 3);
    assert.equal(versions.find(v => v.id === emptyVersionId).draft, "");
    assert.equal(versions.find(v => v.id === blankVersionId).draft, whitespace);
    assert.equal(versions.find(v => v.id === blankVersionId).source, source);
    assert.equal(versions.find(v => v.id === seedVersionId).draft, "Original writer text.");
    const replay = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST", headers, json: request(whitespace, emptyVersionId, "whitespace-on-phone") });
    assert.equal(replay.status, 200, replay.text);
    assert.equal(replay.json.version_id, blankVersionId);
    const altered = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST", headers, json: request("", emptyVersionId, "whitespace-on-phone") });
    assert.equal(altered.status, 409, altered.text);
    const stale = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST", headers, json: request("", seedVersionId, "stale-delete") });
    assert.equal(stale.status, 409, stale.text);
    const other = await signup(server, `other-blank-${stamp}@example.test`, password, "Other Writer");
    const forbidden = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST", headers: authHeaders(other), json: request("", blankVersionId, "other-delete") });
    assert.equal(forbidden.status, 404, forbidden.text);
    const after = await read();
    assert.equal(after.json.project.versions.length, 3, "Rejected writes and retries must create no versions.");
    assert.equal(after.json.project.active_version_id, blankVersionId);
  } finally {
    assert.equal((await server.stop()).forced, false);
  }
});
}

async function signup(server, email, password, displayName) {
  const response = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: {
      email,
      password,
      display_name: displayName,
    },
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

test("[screenplay-cross-device] iPhone save restores on desktop after backend restart", async () => {
  let server = await startBackend({ env: { REQUIRE_USER_AUTH: "true" } });
  const dataDir = server.dataDir;
  const stamp = randomUUID().replace(/-/g, "");
  const email = `cross-device-${stamp}@example.test`;
  const password = `Cross-device-${stamp}-aA1!`;
  const projectId = `cross-device-${stamp.slice(0, 12)}`;
  const firstDraft = "  \tINT. EDIT SUITE - NIGHT\r\n\r\nThe desktop timeline waits.\t \r\n";
  const iPhoneDraft = `${firstDraft}\n\nEXT. FERRY DOCK - DAWN\n\nMARA saves the scene from her phone.`;
  let firstVersionId = "";
  let iPhoneVersionId = "";

  try {
    const firstToken = await signup(server, email, password, "Cross Device Writer");
    const firstHeaders = authHeaders(firstToken);
    const created = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers: firstHeaders,
      json: {
        project_id: projectId,
        title: "Cross Device Feature",
        activate: true,
      },
    });
    assert.equal(created.status, 201, created.text);

    const firstSave = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST",
      headers: firstHeaders,
      json: {
        draft: firstDraft,
        source: "studio_manual",
        conflict_strategy: "reject_if_stale",
        client_request_id: "desktop-seed-save",
      },
    });
    assert.equal(firstSave.status, 201, firstSave.text);
    assert.equal(firstSave.json?.version?.draft, firstDraft, "Save exactly the submitted writer text.");
    firstVersionId = String(firstSave.json?.version_id || "");
    assert.ok(firstVersionId);

    const iPhoneToken = await login(server, email, password);
    const iPhoneSave = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST",
      headers: authHeaders(iPhoneToken),
      json: {
        draft: iPhoneDraft,
        source: "studio_clementine_page_write",
        base_version_id: firstVersionId,
        conflict_strategy: "reject_if_stale",
        client_request_id: "iphone-durable-save",
      },
    });
    assert.equal(iPhoneSave.status, 201, iPhoneSave.text);
    assert.equal(iPhoneSave.json?.version?.draft, iPhoneDraft);
    iPhoneVersionId = String(iPhoneSave.json?.version_id || "");
    assert.ok(iPhoneVersionId);
  } finally {
    const stopped = await server.stop();
    assert.equal(stopped.forced, false, "backend should drain before restart");
  }

  server = await startBackend({ dataDir, env: { REQUIRE_USER_AUTH: "true" } });
  try {
    const desktopToken = await login(server, email, password);
    const desktopHeaders = authHeaders(desktopToken);
    const list = await apiRequest(server, "/screenplay/projects?include_versions=0&include_drafts=0", {
      headers: desktopHeaders,
    });
    assert.equal(list.status, 200, list.text);
    assert.equal(list.json?.screenplay_active_project_id, projectId);
    assert.ok((list.json?.screenplay_projects || []).some((project) => project.id === projectId));

    const detail = await apiRequest(
      server,
      `/screenplay/projects/${projectId}?include_drafts=1&version_limit=24`,
      { headers: desktopHeaders },
    );
    assert.equal(detail.status, 200, detail.text);
    assert.equal(detail.json?.project?.active_version_id, iPhoneVersionId);
    const restoredVersion = (detail.json?.project?.versions || [])
      .find((version) => version.id === iPhoneVersionId);
    assert.equal(restoredVersion?.draft, iPhoneDraft);
    assert.equal(restoredVersion?.client_request_id, "iphone-durable-save");

    const replay = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST",
      headers: desktopHeaders,
      json: {
        draft: iPhoneDraft,
        source: "studio_clementine_page_write",
        base_version_id: firstVersionId,
        conflict_strategy: "reject_if_stale",
        client_request_id: "iphone-durable-save",
      },
    });
    assert.equal(replay.status, 200, replay.text);
    assert.equal(replay.json?.status, "replayed");
    assert.equal(replay.json?.version_id, iPhoneVersionId);

    const changedReplay = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST", headers: desktopHeaders,
      json: { draft: iPhoneDraft + "\n", client_request_id: "iphone-durable-save" },
    });
    assert.equal(changedReplay.status, 409, "Whitespace-distinct requests must not replay an older save.");
    assert.equal(changedReplay.json?.status, "client_request_id_reused");

    const stale = await apiRequest(server, `/screenplay/projects/${projectId}/version`, {
      method: "POST",
      headers: desktopHeaders,
      json: {
        draft: `${firstDraft}\n\nA stale desktop edit.`,
        base_version_id: firstVersionId,
        conflict_strategy: "reject_if_stale",
        client_request_id: "desktop-stale-save",
      },
    });
    assert.equal(stale.status, 409, stale.text);
    assert.equal(stale.json?.server_version_id, iPhoneVersionId);

    const otherEmail = `other-${stamp}@example.test`;
    const otherToken = await signup(server, otherEmail, password, "Other Writer");
    const forbiddenRead = await apiRequest(server, `/screenplay/projects/${projectId}`, {
      headers: authHeaders(otherToken),
    });
    assert.equal(forbiddenRead.status, 404, forbiddenRead.text);
  } finally {
    const stopped = await server.stop();
    assert.equal(stopped.forced, false, "restarted backend should drain cleanly");
  }
});
