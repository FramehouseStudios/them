import assert from "node:assert/strict";
import { test } from "node:test";

import { createJsonPersistence } from "../lib/persistence_json.js";
import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";

const PROJECT_A_ID = "session-freshness-project-a";
const PROJECT_B_ID = "session-freshness-project-b";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function signup(server) {
  const response = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: {
      email: "session-screenplay-freshness@example.test",
      password: "Session-screenplay-freshness-aA1!",
      display_name: "Session Freshness Test",
    },
  });
  assert.equal(response.status, 201, response.text);
  return {
    token: String(response.json?.access_token || response.json?.token || ""),
    userId: String(response.json?.user?.user_id || ""),
  };
}

function pendingQuestion({ id, projectId, projectTitle, askedAt }) {
  return {
    id,
    projectId,
    projectTitle,
    targetField: "project.theme_argument",
    targetLabel: "the theme",
    question: `What should ${projectTitle} ultimately argue?`,
    askedAtTurn: 1,
    expiresAfterTurn: 3,
    askedAt,
  };
}

test("[session-screenplay-freshness] session refreshes the canonical active project and honors its tombstone", async () => {
  const primary = await startBackend();
  let stale = null;
  try {
    const identity = await signup(primary);
    assert.ok(identity.token, "signup returns an access token");
    assert.ok(identity.userId, "signup returns a user id");
    const headers = authHeaders(identity.token);

    const projectA = await apiRequest(primary, "/screenplay/projects", {
      method: "POST",
      headers,
      json: {
        project_id: PROJECT_A_ID,
        title: "Fallback Feature",
        activate: true,
      },
    });
    assert.equal(projectA.status, 201, projectA.text);

    const projectB = await apiRequest(primary, "/screenplay/projects", {
      method: "POST",
      headers,
      json: {
        project_id: PROJECT_B_ID,
        title: "Canonical Feature",
        activate: false,
      },
    });
    assert.equal(projectB.status, 201, projectB.text);
    assert.equal(projectB.json?.screenplay_active_project_id, PROJECT_A_ID);

    const persistence = createJsonPersistence({
      jsonRoot: primary.env.PERSISTENCE_JSON_ROOT,
    });
    const memoryUpdatedAt = Date.now();
    await persistence.put({
      domain: "user_memory",
      key: `byUserId:${identity.userId}`,
      value: {
        userId: identity.userId,
        updatedAt: memoryUpdatedAt,
        memory: {
          lastUpdatedAt: memoryUpdatedAt,
          screenplayProjectMemoryUpdatedAt: memoryUpdatedAt,
          screenplayProjectMemory: [
            {
              projectId: PROJECT_A_ID,
              projectTitle: "Fallback Feature",
              currentBeat: "The fallback story beat.",
              createdAt: 1_000,
              updatedAt: 3_000,
            },
            {
              projectId: PROJECT_B_ID,
              projectTitle: "Canonical Feature",
              currentBeat: "The canonical story beat.",
              createdAt: 1_000,
              updatedAt: 2_000,
            },
          ],
          pendingScreenplayLearningQuestions: [
            pendingQuestion({
              id: "question-for-project-a",
              projectId: PROJECT_A_ID,
              projectTitle: "Fallback Feature",
              askedAt: 3_000,
            }),
            pendingQuestion({
              id: "question-for-project-b",
              projectId: PROJECT_B_ID,
              projectTitle: "Canonical Feature",
              askedAt: 2_000,
            }),
          ],
        },
      },
    });

    // This instance hydrates project A into its process-local screenplay cache.
    stale = await startBackend({ dataDir: primary.dataDir });

    const activateB = await apiRequest(
      primary,
      `/screenplay/projects/${PROJECT_B_ID}/activate`,
      { method: "POST", headers, json: {} },
    );
    assert.equal(activateB.status, 200, activateB.text);
    assert.equal(activateB.json?.screenplay_active_project_id, PROJECT_B_ID);

    const canonicalSession = await apiRequest(stale, "/session", {
      method: "POST",
      headers,
    });
    assert.equal(canonicalSession.status, 201, canonicalSession.text);
    assert.ok(canonicalSession.json?.client_token, "session response contract remains intact");
    assert.equal(
      canonicalSession.json?.pending_screenplay_question?.id,
      "question-for-project-b",
      "the stale instance must target the canonical active project",
    );

    await persistence.put({
      domain: "screenplay",
      key: `user:${identity.userId}`,
      value: {
        screenplayOwnerTombstone: true,
        version: 1,
        deletedAt: Date.now(),
      },
    });

    const tombstonedSession = await apiRequest(stale, "/session", {
      method: "POST",
      headers,
    });
    assert.equal(tombstonedSession.status, 201, tombstonedSession.text);
    assert.ok(tombstonedSession.json?.client_token, "tombstone does not change the session response contract");
    assert.equal(
      tombstonedSession.json?.pending_screenplay_question?.id,
      "question-for-project-a",
      "a tombstone must clear cached project B and use the normal project-memory fallback",
    );

    await persistence.close();
  } finally {
    if (stale) {
      const stopped = await stale.stop();
      assert.equal(stopped.forced, false, "stale backend should drain cleanly on SIGTERM");
    }
    const stopped = await primary.stop();
    assert.equal(stopped.forced, false, "primary backend should drain cleanly on SIGTERM");
  }
});
