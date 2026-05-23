// Day 1 Backend Exposure Lock — IDOR + protected-route regression suite.
//
// Goal of Day 1: client-supplied identity must NEVER be trusted.
//   - inbound X-User-Id is stripped before identity is attached;
//   - attachUserAuth no longer rewrites req.headers["x-user-id"];
//   - screenplay owner resolution uses req.authUser.id / req.userId only;
//   - cost-attached realtime + visual endpoints require authenticated
//     identity regardless of REQUIRE_USER_AUTH.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  authSessionIdByTokenHash,
  authSessionsById,
  configureUserStore,
  emailVerificationTokensByHash,
  passwordResetTokensByHash,
  usersByAppleSubject,
  usersByEmail,
  usersById,
} from "../lib/user_store.js";
import { createUserAuthSubsystem } from "../lib/user_auth.js";
import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

// ---------- attachUserAuth contract (unit) ----------

function tempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-exposure-lock-"));
  return path.join(dir, "users.json");
}

function resetUserStoreState() {
  usersById.clear();
  usersByEmail.clear();
  usersByAppleSubject.clear();
  authSessionsById.clear();
  authSessionIdByTokenHash.clear();
  emailVerificationTokensByHash.clear();
  passwordResetTokensByHash.clear();
}

function setupSubsystem(overrides = {}) {
  resetUserStoreState();
  configureUserStore({
    USER_STORE_PATH: tempStorePath(),
    fs,
    writeJsonFileAtomic: (filePath, payload) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      return true;
    },
    normalizeSnippet: (v, max = 160) => {
      const s = String(v || "").trim();
      return s.length <= max ? s : s.slice(0, max);
    },
  });
  return createUserAuthSubsystem({
    nodeEnv: "test",
    jwtSecret: "exposure-lock-test-secret",
    accessTtlSeconds: 900,
    refreshTtlSeconds: 3600,
    requireUserAuth: true,
    ...overrides,
  });
}

function makeRes() {
  return {
    _status: 200,
    _body: null,
    _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
  };
}

function makeReqWithHeaders(headers = {}, body = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return {
    body,
    headers: normalized,
    get(name) {
      return normalized[String(name || "").toLowerCase()];
    },
    path: "/state",
  };
}

test("[exposure-lock] attachUserAuth strips inbound x-user-id header even when no token is present", async () => {
  const auth = setupSubsystem();
  const req = makeReqWithHeaders({ "X-User-Id": "victim-user-id" });
  await new Promise((resolve) => auth.attachUserAuth(req, makeRes(), resolve));
  assert.equal(req.headers["x-user-id"], undefined, "lowercase variant must be removed");
  assert.equal(req.headers["X-User-Id"], undefined, "title-case variant must be removed");
  assert.equal(req.authUser, null);
  assert.equal(req.userId, undefined);
});

test("[exposure-lock] attachUserAuth strips inbound x-user-id even when a valid token is present", async () => {
  const auth = setupSubsystem();
  const signupRes = makeRes();
  await auth.handleAuthSignup(
    { body: { email: "alice@example.com", password: "alice-password-123" } },
    signupRes,
  );
  assert.equal(signupRes._status, 201);
  const token = signupRes._body.access_token;
  const aliceId = signupRes._body.user.user_id;

  const req = makeReqWithHeaders({
    Authorization: "Bearer " + token,
    "X-User-Id": "bob-impersonation-attempt",
  });
  await new Promise((resolve) => auth.attachUserAuth(req, makeRes(), resolve));
  assert.equal(req.authUser?.id, aliceId);
  assert.equal(req.userId, aliceId);
  assert.equal(
    req.headers["x-user-id"],
    undefined,
    "Day 1 contract: attachUserAuth must not rewrite x-user-id with the auth-derived id",
  );
});

// ---------- protected-route enforcement (integration) ----------

async function signupReturningToken(server, email) {
  const signup = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: { email, password: "exposure-lock-pw-123" },
  });
  assert.equal(signup.status, 201, "signup should succeed");
  const token = String(signup.json?.access_token || signup.json?.token || "");
  const userId = String(signup.json?.user?.user_id || "");
  assert.ok(token, "signup must return an access token");
  assert.ok(userId, "signup must return a user_id");
  return { token, userId };
}

test("[exposure-lock] POST /realtime/client_secret rejects unauthenticated requests with 401", async () => {
  const server = await startBackend();
  try {
    const r = await apiRequest(server, "/realtime/client_secret", {
      method: "POST",
      json: { instructions: "test" },
    });
    assert.equal(r.status, 401);
    assert.equal(r.json?.stage, "auth_user");
  } finally {
    await server.stop();
  }
});

test("[exposure-lock] POST /realtime/studio_render rejects unauthenticated requests with 401", async () => {
  const server = await startBackend();
  try {
    const r = await apiRequest(server, "/realtime/studio_render", {
      method: "POST",
      json: { transcript: "test" },
    });
    assert.equal(r.status, 401);
    assert.equal(r.json?.stage, "auth_user");
  } finally {
    await server.stop();
  }
});

test("[exposure-lock] POST /realtime/studio_render_stream rejects unauthenticated requests with 401", async () => {
  const server = await startBackend();
  try {
    const r = await apiRequest(server, "/realtime/studio_render_stream", {
      method: "POST",
      json: { transcript: "test" },
    });
    assert.equal(r.status, 401);
    assert.equal(r.json?.stage, "auth_user");
  } finally {
    await server.stop();
  }
});

test("[exposure-lock] POST /realtime/turn_commit rejects unauthenticated requests with 401", async () => {
  const server = await startBackend();
  try {
    const r = await apiRequest(server, "/realtime/turn_commit", {
      method: "POST",
      json: {},
    });
    assert.equal(r.status, 401);
    assert.equal(r.json?.stage, "auth_user");
  } finally {
    await server.stop();
  }
});

test("[exposure-lock] POST /realtime/call rejects unauthenticated requests with 401", async () => {
  const server = await startBackend();
  try {
    const r = await apiRequest(server, "/realtime/call", {
      method: "POST",
      json: {},
    });
    assert.equal(r.status, 401);
    assert.equal(r.json?.stage, "auth_user");
  } finally {
    await server.stop();
  }
});

test("[exposure-lock] POST /visual/context rejects unauthenticated requests with 401", async () => {
  const server = await startBackend();
  try {
    const r = await apiRequest(server, "/visual/context", {
      method: "POST",
      json: { image_data_url: "data:image/png;base64,iVBORw=" },
    });
    assert.equal(r.status, 401);
    assert.equal(r.json?.stage, "auth_user");
  } finally {
    await server.stop();
  }
});

test("[exposure-lock] GET /realtime/health remains unauthenticated (health/proxy surface)", async () => {
  const server = await startBackend();
  try {
    const r = await apiRequest(server, "/realtime/health");
    // health should not return 401 — it's not in PAID_PROVIDER_PATTERNS.
    assert.notEqual(r.status, 401);
  } finally {
    await server.stop();
  }
});

// ---------- IDOR: client-supplied X-User-Id cannot impersonate ----------

test("[exposure-lock] IDOR — client-supplied X-User-Id cannot select another user's screenplay owner", async () => {
  const server = await startBackend();
  try {
    const alice = await signupReturningToken(server, "alice-idor@example.com");
    const bob = await signupReturningToken(server, "bob-idor@example.com");
    assert.notEqual(alice.userId, bob.userId);

    // Alice creates a project under her own identity.
    const created = await apiRequest(server, "/screenplay/projects", {
      method: "POST",
      headers: { Authorization: "Bearer " + alice.token },
      json: { title: "Alice's secret screenplay" },
    });
    assert.equal(created.status, 201, "alice creates project");
    const projectId = String(
      created.json?.project_id
        || created.json?.project?.id
        || ""
    );
    assert.ok(projectId, "alice's project should have an id");

    // Bob, even when supplying X-User-Id: <alice's id>, must NOT see
    // Alice's projects. The IDOR was that resolveScreenplayOwnerKey
    // trusted the inbound header.
    const bobList = await apiRequest(server, "/screenplay/projects", {
      headers: {
        Authorization: "Bearer " + bob.token,
        "X-User-Id": alice.userId,
      },
    });
    assert.equal(bobList.status, 200);
    const bobProjectIds = (bobList.json?.screenplay_projects || []).map(
      (p) => String(p?.id || "")
    );
    assert.equal(
      bobProjectIds.includes(projectId),
      false,
      "bob must not see alice's project via X-User-Id impersonation",
    );

    // A wholly anonymous attacker (no Authorization at all) must not
    // see Alice's projects either: /screenplay/* is protected by
    // REQUIRE_USER_AUTH=1 in tests, so this should 401.
    const anon = await apiRequest(server, "/screenplay/projects", {
      headers: { "X-User-Id": alice.userId },
    });
    assert.equal(anon.status, 401);
  } finally {
    await server.stop();
  }
});
