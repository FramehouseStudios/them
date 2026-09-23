// T-decompose-phase4-auth-routes — integration tests for the 11
// `/auth/*` routes via `mountAuthRoutes`. Pin byte-identical wiring
// + required-deps guard + JSON parser limit.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";

import { mountAuthRoutes, AUTH_BODY_LIMIT } from "../lib/auth_routes.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
function buildUserAuthStub() {
  const calls = {};
  const handler = (name) => (req, res) => {
    calls[name] = (calls[name] || 0) + 1;
    res.status(200).json({ ok: true, handler: name, body: req.body || null });
  };
  return {
    calls,
    handleAuthSignup: handler("handleAuthSignup"),
    handleAuthLogin: handler("handleAuthLogin"),
    handleAuthApple: handler("handleAuthApple"),
    handleAuthRefresh: handler("handleAuthRefresh"),
    handleAuthLogout: handler("handleAuthLogout"),
    handleAuthSessions: handler("handleAuthSessions"),
    handleAuthSessionsRevoke: handler("handleAuthSessionsRevoke"),
    handleAuthRequestPasswordReset: handler("handleAuthRequestPasswordReset"),
    handleAuthResetPassword: handler("handleAuthResetPassword"),
    handleAuthRequestEmailVerification: handler("handleAuthRequestEmailVerification"),
    handleAuthVerifyEmail: handler("handleAuthVerifyEmail"),
  };
}

async function withTestServer(userAuth, fn, configureAfterMount = null) {
  const app = express();
  mountAuthRoutes(app, { userAuth });
  if (typeof configureAfterMount === "function") {
    configureAfterMount(app);
  }
  const server = listenEphemeral(app);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(baseURL, path, body) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function get(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[auth-routes] AUTH_BODY_LIMIT is 256kb", () => {
  assert.equal(AUTH_BODY_LIMIT, "256kb");
});

test("[auth-routes] mount fails without Express app", () => {
  assert.throws(() => mountAuthRoutes(null, { userAuth: buildUserAuthStub() }));
});

test("[auth-routes] mount fails without userAuth subsystem", () => {
  const app = express();
  assert.throws(
    () => mountAuthRoutes(app, {}),
    /userAuth subsystem/,
  );
});

test("[auth-routes] mount fails when any handler is missing", () => {
  const handlers = [
    "handleAuthSignup",
    "handleAuthLogin",
    "handleAuthApple",
    "handleAuthRefresh",
    "handleAuthLogout",
    "handleAuthSessions",
    "handleAuthSessionsRevoke",
    "handleAuthRequestPasswordReset",
    "handleAuthResetPassword",
    "handleAuthRequestEmailVerification",
    "handleAuthVerifyEmail",
  ];
  for (const missing of handlers) {
    const userAuth = buildUserAuthStub();
    delete userAuth[missing];
    const app = express();
    assert.throws(
      () => mountAuthRoutes(app, { userAuth }),
      new RegExp(missing),
      `should reject missing ${missing}`,
    );
  }
});

test("[auth-routes] POST /auth/signup invokes handleAuthSignup with parsed body", async () => {
  const userAuth = buildUserAuthStub();
  await withTestServer(userAuth, async (baseURL) => {
    const r = await post(baseURL, "/auth/signup", { email: "a@b.com" });
    assert.equal(r.status, 200);
    assert.equal(r.body.handler, "handleAuthSignup");
    assert.deepEqual(r.body.body, { email: "a@b.com" });
    assert.equal(userAuth.calls.handleAuthSignup, 1);
  });
});

test("[auth-routes] rejected async handlers reach Express error middleware", async () => {
  const userAuth = buildUserAuthStub();
  userAuth.handleAuthSignup = async () => {
    throw new Error("simulated async auth failure");
  };
  await withTestServer(
    userAuth,
    async (baseURL) => {
      const r = await post(baseURL, "/auth/signup", { email: "a@b.com" });
      assert.equal(r.status, 500);
      assert.equal(r.body.error, "auth_route_failed");
    },
    (app) => {
      app.use((error, _req, res, _next) => {
        assert.match(error.message, /simulated async auth failure/);
        res.status(500).json({ error: "auth_route_failed" });
      });
    },
  );
});

test("[auth-routes] POST /auth/login + /auth/apple + /auth/refresh + /auth/logout each parses body", async () => {
  const userAuth = buildUserAuthStub();
  await withTestServer(userAuth, async (baseURL) => {
    for (const p of ["login", "apple", "refresh", "logout"]) {
      const r = await post(baseURL, `/auth/${p}`, { p });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.body, { p });
    }
    assert.equal(userAuth.calls.handleAuthLogin, 1);
    assert.equal(userAuth.calls.handleAuthApple, 1);
    assert.equal(userAuth.calls.handleAuthRefresh, 1);
    assert.equal(userAuth.calls.handleAuthLogout, 1);
  });
});

test("[auth-routes] GET /auth/sessions mounts without body parser", async () => {
  const userAuth = buildUserAuthStub();
  await withTestServer(userAuth, async (baseURL) => {
    const r = await get(baseURL, "/auth/sessions");
    assert.equal(r.status, 200);
    assert.equal(r.body.handler, "handleAuthSessions");
    assert.equal(userAuth.calls.handleAuthSessions, 1);
  });
});

test("[auth-routes] POST /auth/sessions/revoke parses body", async () => {
  const userAuth = buildUserAuthStub();
  await withTestServer(userAuth, async (baseURL) => {
    const r = await post(baseURL, "/auth/sessions/revoke", { sessionId: "s1" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.body, { sessionId: "s1" });
  });
});

test("[auth-routes] all password-reset + email-verification routes parse body", async () => {
  const userAuth = buildUserAuthStub();
  await withTestServer(userAuth, async (baseURL) => {
    const paths = [
      "/auth/request_password_reset",
      "/auth/reset_password",
      "/auth/request_email_verification",
      "/auth/verify_email",
    ];
    for (const p of paths) {
      const r = await post(baseURL, p, { token: "tok" });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.body, { token: "tok" });
    }
  });
});

test("[auth-routes] routes work without app-level express.json() upstream (production-style)", async () => {
  // Bare Express app — no app.use(express.json()) — relies on the
  // route-local parser the lib mounts. If the lib forgot the parser,
  // req.body would be undefined and the test would fail.
  const userAuth = buildUserAuthStub();
  await withTestServer(userAuth, async (baseURL) => {
    const r = await post(baseURL, "/auth/login", { email: "x@y.com" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.body, { email: "x@y.com" });
  });
});

test("[auth-routes] index.js wires mountAuthRoutes and has no inline /auth route registration", () => {
  const indexPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.js");
  const source = fs.readFileSync(indexPath, "utf8");
  assert.match(source, /mountAuthRoutes\(app,\s*\{\s*userAuth\s*\}\)/);
  assert.match(source, /from ["']\.\/lib\/auth_routes\.js["']/);
  // Strangler rule: no parallel inline auth HTTP registration left in the god file.
  assert.doesNotMatch(source, /app\.post\(\s*["']\/auth\//);
  assert.doesNotMatch(source, /app\.get\(\s*["']\/auth\//);
  assert.doesNotMatch(source, /const authJson\s*=/);
  assert.doesNotMatch(source, /wrapAuthHandler/);
});
