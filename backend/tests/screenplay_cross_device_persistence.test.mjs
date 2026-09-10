import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";
import {
  SCREENPLAY_DRAFT_HASH_VERSION,
  hashCanonicalScreenplayDraft,
} from "../lib/screenplay_draft_receipt_protocol.js";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
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
  let server = await startBackend();
  const dataDir = server.dataDir;
  const stamp = randomUUID().replace(/-/g, "");
  const email = `cross-device-${stamp}@example.test`;
  const password = `Cross-device-${stamp}-aA1!`;
  const projectId = `cross-device-${stamp.slice(0, 12)}`;
  const firstDraft = "INT. EDIT SUITE - NIGHT\n\nThe desktop timeline waits.";
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
    iPhoneVersionId = String(iPhoneSave.json?.version_id || "");
    assert.ok(iPhoneVersionId);
    assert.equal(iPhoneSave.json?.client_request_id, "iphone-durable-save");
    assert.equal(iPhoneSave.json?.draft_hash_version, SCREENPLAY_DRAFT_HASH_VERSION);
    assert.equal(iPhoneSave.json?.draft_hash, hashCanonicalScreenplayDraft(iPhoneDraft));
  } finally {
    const stopped = await server.stop();
    assert.equal(stopped.forced, false, "backend should drain before restart");
  }

  server = await startBackend({ dataDir });
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
    assert.equal(replay.json?.client_request_id, "iphone-durable-save");
    assert.equal(replay.json?.draft_hash_version, SCREENPLAY_DRAFT_HASH_VERSION);
    assert.equal(replay.json?.draft_hash, hashCanonicalScreenplayDraft(iPhoneDraft));

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
    assert.equal(stale.json?.client_request_id, "desktop-stale-save");
    assert.equal(stale.json?.draft_hash_version, SCREENPLAY_DRAFT_HASH_VERSION);
    assert.equal(stale.json?.draft_hash, hashCanonicalScreenplayDraft(iPhoneDraft));

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
