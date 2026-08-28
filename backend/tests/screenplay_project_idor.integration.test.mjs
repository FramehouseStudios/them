// T-screenplay-idor-regression — direct-object authorization proof.
//
// The Day 1 exposure lock proves that client-supplied X-User-Id cannot become
// identity. This integration test closes the complementary gap: even with a
// valid session and a known project id, one user cannot read or mutate another
// user's screenplay resources.

import assert from "node:assert/strict";
import { test } from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

const PASSWORD = "screenplay-idor-password-123";

async function signup(server, email) {
  const response = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: { email, password: PASSWORD },
  });
  assert.equal(response.status, 201, `${email} signup`);
  const token = String(response.json?.token || response.json?.access_token || "");
  const userId = String(response.json?.user?.user_id || "");
  assert.ok(token.length > 20, `${email} access token`);
  assert.ok(userId, `${email} user id`);
  return { email, token, userId };
}

function authHeaders(user, extra = {}) {
  return { Authorization: `Bearer ${user.token}`, ...extra };
}

function assertNoPrivateContent(response, secrets, context) {
  const serialized = `${response.text || ""}\n${JSON.stringify(response.json || {})}`;
  for (const secret of secrets) {
    assert.ok(!serialized.includes(secret), `${context} leaked private content: ${secret}`);
  }
}

test("[screenplay-idor] a valid user cannot access another user's project by id", async () => {
  const server = await startBackend();
  try {
    const alice = await signup(server, "alice-project-owner@example.com");
    const bob = await signup(server, "bob-project-attacker@example.com");
    assert.notEqual(alice.userId, bob.userId);

    const privateTitle = "ALICE_PRIVATE_PROJECT_7F3A";
    const privateOutline = "ALICE_PRIVATE_OUTLINE_2C91";
    const privateComment = "ALICE_PRIVATE_COMMENT_8E44";
    const privateDraft = "ALICE_PRIVATE_DRAFT_5B62";
    const secrets = [privateTitle, privateOutline, privateComment, privateDraft];

    const created = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers: authHeaders(alice),
      json: { title: privateTitle },
    });
    assert.equal(created.status, 201);
    const projectId = String(created.json?.project_id || created.json?.project?.id || "");
    assert.ok(projectId, "Alice project id");

    const aliceWrites = [
      ["outline", { acts: [{ id: "act-private", title: privateOutline }] }],
      ["comments", { text: privateComment, author_email: alice.email }],
      ["version", { draft: `FADE IN:\n\nINT. PRIVATE ROOM - NIGHT\n\n${privateDraft}` }],
    ];
    for (const [suffix, json] of aliceWrites) {
      const response = await apiRequest(server, `/screenplay/projects/${projectId}/${suffix}`, {
        method: "POST",
        headers: authHeaders(alice),
        json,
      });
      assert.ok([200, 201].includes(response.status), `Alice writes ${suffix}`);
    }

    // Bob has a real access token and knows Alice's id. Supplying Alice's old
    // header identity as well must not select Alice's owner record.
    const bobSpoofHeaders = authHeaders(bob, { "X-User-Id": alice.userId });
    for (const pathname of [
      `/screenplay/projects/${projectId}`,
      `/screenplay/projects/${projectId}/outline`,
      `/screenplay/projects/${projectId}/collaborators`,
      `/screenplay/projects/${projectId}/comments`,
    ]) {
      const response = await apiRequest(server, pathname, { headers: bobSpoofHeaders });
      assert.equal(response.status, 404, `Bob direct read ${pathname}`);
      assert.equal(response.json?.error, "project_not_found");
      assertNoPrivateContent(response, secrets, `Bob direct read ${pathname}`);
    }

    const bobMutations = [
      ["outline", { acts: [{ id: "hijack", label: "BOB_HIJACK" }] }],
      ["scenes", { scene: { heading: "INT. HIJACK - DAY", action: "BOB_HIJACK" } }],
      ["beats", { beat: { label: "BOB_HIJACK" } }],
      ["collaborators", { email: bob.email }],
      ["comments", { text: "BOB_HIJACK", author_email: bob.email }],
      ["version", { draft: "FADE IN:\n\nBOB_HIJACK" }],
    ];
    for (const [suffix, json] of bobMutations) {
      const pathname = `/screenplay/projects/${projectId}/${suffix}`;
      const response = await apiRequest(server, pathname, {
        method: "POST",
        headers: bobSpoofHeaders,
        json,
      });
      assert.equal(response.status, 404, `Bob mutation ${pathname}`);
      assert.equal(response.json?.error, "project_not_found");
      assertNoPrivateContent(response, secrets, `Bob mutation ${pathname}`);
    }

    const deleted = await apiRequest(server, `/screenplay/projects/${projectId}`, {
      method: "DELETE",
      headers: bobSpoofHeaders,
    });
    assert.equal(deleted.status, 405, "Project DELETE stays unavailable");
    assert.equal(deleted.headers.get("allow"), "GET", "Method guard advertises only the read route");
    assertNoPrivateContent(deleted, secrets, "Bob delete attempt");

    const bobList = await apiRequest(server, "/screenplay/projects", { headers: bobSpoofHeaders });
    assert.equal(bobList.status, 200);
    const bobProjectIds = (bobList.json?.screenplay_projects || []).map((project) => String(project?.id || ""));
    assert.ok(!bobProjectIds.includes(projectId), "Bob list cannot enumerate Alice's project");
    assertNoPrivateContent(bobList, secrets, "Bob project list");

    // The collection upsert accepts caller-supplied project ids. Reusing
    // Alice's id is allowed only as a new Bob-owned record; it must never find
    // or update Alice's record across the owner namespace boundary.
    const bobSameId = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers: bobSpoofHeaders,
      json: { project_id: projectId, title: "BOB_HIJACK", activate: false },
    });
    assert.equal(bobSameId.status, 201, "Same id creates a separate Bob-owned project");
    assert.equal(bobSameId.json?.created, true);
    assert.equal(bobSameId.json?.project?.id, projectId);
    assert.equal(bobSameId.json?.project?.title, "BOB_HIJACK");
    assertNoPrivateContent(bobSameId, secrets, "Bob same-id collection upsert");

    const anonymous = await apiRequest(server, `/screenplay/projects/${projectId}`, {
      headers: { "X-User-Id": alice.userId },
    });
    assert.equal(anonymous.status, 401, "Header-only attacker remains unauthenticated");
    assertNoPrivateContent(anonymous, secrets, "Anonymous direct read");

    const aliceRead = await apiRequest(
      server,
      `/screenplay/projects/${projectId}?include_drafts=true`,
      { headers: authHeaders(alice) }
    );
    assert.equal(aliceRead.status, 200, "Owner still reads the project");
    const alicePayload = JSON.stringify(aliceRead.json || {});
    assert.equal(aliceRead.json?.project?.version_count, 1, "Rejected writes add no owner versions");
    assert.equal(aliceRead.json?.project?.comment_count, 1, "Rejected writes add no owner comments");
    assert.equal(aliceRead.json?.project?.collaborator_count, 0, "Rejected writes add no collaborators");
    for (const secret of secrets) {
      assert.ok(alicePayload.includes(secret), `Owner sentinel remains intact: ${secret}`);
    }
    assert.ok(!alicePayload.includes(bob.email), "Rejected collaborator write adds no attacker email");
    assert.ok(!alicePayload.includes("BOB_HIJACK"), "Rejected mutations changed no owner data");
  } finally {
    await server.stop();
  }
});
