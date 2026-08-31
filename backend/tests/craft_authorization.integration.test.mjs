import assert from "node:assert/strict";
import { test } from "node:test";

import {
  craftStorageProjectId,
  isPublicCraftRoute,
} from "../lib/craft_routes.js";
import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

async function signup(server, email) {
  const response = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: { email, password: "craft-authorization-test-password" },
  });
  assert.equal(response.status, 201, response.text);
  return {
    token: String(response.json?.access_token || response.json?.token || ""),
    userId: String(response.json?.user?.user_id || ""),
  };
}

function authHeaders(identity, extra = {}) {
  return { Authorization: `Bearer ${identity.token}`, ...extra };
}

async function createProject(server, identity, projectId) {
  const response = await apiRequest(server, "/screenplay/projects", {
    method: "POST",
    headers: authHeaders(identity),
    json: { project_id: projectId, title: `Project for ${identity.userId}` },
  });
  assert.equal(response.status, 201, response.text);
  return response;
}

test("[craft-auth] public route classification is narrow and method-aware", () => {
  assert.equal(isPublicCraftRoute("GET", "/frameworks"), true);
  assert.equal(isPublicCraftRoute("GET", "/frameworks/save-the-cat"), true);
  assert.equal(isPublicCraftRoute("GET", "/schemas/report"), true);
  assert.equal(isPublicCraftRoute("GET", "/schemas/framework"), true);

  assert.equal(isPublicCraftRoute("POST", "/frameworks"), false);
  assert.equal(isPublicCraftRoute("GET", "/frameworks/save-the-cat/private"), false);
  assert.equal(isPublicCraftRoute("GET", "/schemas/unknown"), false);
  assert.equal(isPublicCraftRoute("GET", "/reports/project-1"), false);
  assert.equal(isPublicCraftRoute("POST", "/twist/suggest"), false);
  assert.notEqual(
    craftStorageProjectId("alice", "shared-project"),
    craftStorageProjectId("bob", "shared-project"),
  );
});

test("[craft-auth] no token is rejected, cross-user projects are hidden, and same-user access succeeds", async () => {
  const server = await startBackend();
  try {
    const alice = await signup(server, "alice-craft-authorization@example.com");
    const bob = await signup(server, "bob-craft-authorization@example.com");
    assert.notEqual(alice.userId, bob.userId);

    const aliceOverride = await apiRequest(server, "/craft/overrides", {
      method: "POST",
      headers: authHeaders(alice),
      json: {
        turnId: "midpoint",
        action: "mark-present",
        userId: bob.userId,
      },
    });
    assert.equal(aliceOverride.status, 200, aliceOverride.text);
    assert.equal(aliceOverride.json?.userId, alice.userId);
    const overrideId = String(aliceOverride.json?.id || "");
    assert.ok(overrideId);

    const bobOverrideDelete = await apiRequest(server, `/craft/overrides/${overrideId}`, {
      method: "DELETE",
      headers: authHeaders(bob),
    });
    assert.equal(bobOverrideDelete.status, 404);
    assert.equal(bobOverrideDelete.json?.error, "craft_override_not_found");

    const aliceOverrideDelete = await apiRequest(server, `/craft/overrides/${overrideId}`, {
      method: "DELETE",
      headers: authHeaders(alice),
    });
    assert.equal(aliceOverrideDelete.status, 200);

    const projectId = "shared-craft-project";
    await createProject(server, alice, projectId);

    const anonymous = await apiRequest(server, `/craft/reports/${projectId}/v1`);
    assert.equal(anonymous.status, 401);
    assert.ok(["auth_user", "craft_auth"].includes(anonymous.json?.stage));

    const aliceAnalysis = await apiRequest(server, "/craft/analyze", {
      method: "POST",
      headers: authHeaders(alice),
      json: {
        projectId,
        versionId: "v1",
        frameworkId: "save-the-cat",
        screenplay: { pageCount: 110, title: "Alice private analysis" },
      },
    });
    assert.equal(aliceAnalysis.status, 200, aliceAnalysis.text);
    assert.equal(aliceAnalysis.json?.projectId, projectId);

    const aliceRead = await apiRequest(server, `/craft/reports/${projectId}/v1`, {
      headers: authHeaders(alice),
    });
    assert.equal(aliceRead.status, 200, aliceRead.text);
    assert.equal(aliceRead.json?.id, aliceAnalysis.json?.id);

    const bobCrossUserRead = await apiRequest(server, `/craft/reports/${projectId}/v1`, {
      headers: authHeaders(bob, { "X-User-Id": alice.userId }),
    });
    assert.equal(bobCrossUserRead.status, 404);
    assert.equal(bobCrossUserRead.json?.error, "project_not_found");
    assert.ok(!bobCrossUserRead.text.includes("Alice private analysis"));

    // Screenplay project ids are owner-local. Bob may create the same external
    // id, but Craft persistence must remain namespaced by authenticated user.
    await createProject(server, bob, projectId);
    const bobSameIdBeforeAnalysis = await apiRequest(server, `/craft/reports/${projectId}/v1`, {
      headers: authHeaders(bob),
    });
    assert.equal(bobSameIdBeforeAnalysis.status, 404);
    assert.equal(bobSameIdBeforeAnalysis.json?.error, "craft_report_not_found");

    const bobAnalysis = await apiRequest(server, "/craft/analyze", {
      method: "POST",
      headers: authHeaders(bob),
      json: {
        projectId,
        versionId: "v1",
        frameworkId: "three-act",
        screenplay: { pageCount: 90, title: "Bob independent analysis" },
      },
    });
    assert.equal(bobAnalysis.status, 200, bobAnalysis.text);
    assert.equal(bobAnalysis.json?.screenplayTitle, "Bob independent analysis");

    const aliceStillIsolated = await apiRequest(server, `/craft/reports/${projectId}/v1`, {
      headers: authHeaders(alice),
    });
    assert.equal(aliceStillIsolated.status, 200);
    assert.equal(aliceStillIsolated.json?.id, aliceAnalysis.json?.id);
    assert.equal(aliceStillIsolated.json?.screenplayTitle, "Alice private analysis");
  } finally {
    await server.stop();
  }
});
