import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  apiRequest,
  startBackend,
} from "./helpers/backend_test_server.mjs";

function base64UrlEncode(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildAppleTestIdentityToken({
  secret,
  issuer = "https://appleid.apple.com",
  audience = "io.them.them",
  subject = "apple-user-1",
  email = "writer@example.com",
  emailVerified = true,
  expiresInSeconds = 3600,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode({ alg: "HS256", typ: "JWT", kid: "test" });
  const claims = base64UrlEncode({
    iss: issuer,
    aud: audience,
    sub: subject,
    email,
    email_verified: emailVerified,
    iat: now,
    exp: now + expiresInSeconds,
  });
  const signature = createHmac("sha256", String(secret || ""))
    .update(header + "." + claims)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return header + "." + claims + "." + signature;
}

test("signup/login works and protected state routes require user auth", async () => {
  const server = await startBackend();
  try {
    const unauthorized = await apiRequest(server, "/state");
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.json?.stage, "auth_user");

    const signup = await apiRequest(server, "/auth/signup", {
      method: "POST",
      json: {
        email: "writer@example.com",
        password: "writer-password-123",
      },
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.json?.ok, true);
    assert.equal(signup.json?.user?.email, "writer@example.com");
    assert.ok(typeof signup.json?.token === "string" && signup.json.token.length > 20);
    assert.ok(typeof signup.json?.refresh_token === "string" && signup.json.refresh_token.length > 20);

    const login = await apiRequest(server, "/auth/login", {
      method: "POST",
      json: {
        email: "writer@example.com",
        password: "writer-password-123",
      },
    });
    assert.equal(login.status, 200);
    assert.equal(login.json?.ok, true);
    assert.equal(login.json?.user?.email, "writer@example.com");
    assert.ok(typeof login.json?.token === "string" && login.json.token.length > 20);
    assert.ok(typeof login.json?.refresh_token === "string" && login.json.refresh_token.length > 20);

    const session = await apiRequest(server, "/session", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + login.json.token,
      },
    });
    assert.equal(session.status, 201);
    assert.equal(session.json?.user_id, login.json?.user?.user_id);
    assert.ok(typeof session.json?.client_token === "string" && session.json.client_token.length > 10);

    const history = await apiRequest(server, "/history", {
      headers: {
        Authorization: "Bearer " + login.json.token,
      },
    });
    assert.equal(history.status, 200);
    assert.ok(Array.isArray(history.json?.threads));

    const recap = await apiRequest(server, "/recap/today", {
      headers: {
        Authorization: "Bearer " + login.json.token,
      },
    });
    assert.equal(recap.status, 200);
    assert.equal(recap.json?.window, "today");
  } finally {
    await server.stop();
  }
});

test("refresh rotates sessions and logout revokes the current access token", async () => {
  const server = await startBackend();
  try {
    const login = await apiRequest(server, "/auth/signup", {
      method: "POST",
      json: {
        email: "refresh@example.com",
        password: "refresh-password-123",
      },
    });
    assert.equal(login.status, 201);

    const refreshed = await apiRequest(server, "/auth/refresh", {
      method: "POST",
      json: {
        refresh_token: login.json?.refresh_token,
      },
    });
    assert.equal(refreshed.status, 200);
    assert.ok(typeof refreshed.json?.token === "string" && refreshed.json.token.length > 20);
    assert.ok(typeof refreshed.json?.refresh_token === "string" && refreshed.json.refresh_token.length > 20);
    assert.notEqual(refreshed.json?.current_session_id, login.json?.current_session_id);

    const oldState = await apiRequest(server, "/state", {
      headers: {
        Authorization: "Bearer " + login.json.token,
      },
    });
    assert.equal(oldState.status, 401);

    const sessions = await apiRequest(server, "/auth/sessions", {
      headers: {
        Authorization: "Bearer " + refreshed.json.token,
      },
    });
    assert.equal(sessions.status, 200);
    assert.ok(Array.isArray(sessions.json?.sessions));
    assert.ok(sessions.json.sessions.some((session) => session.state === "replaced" || session.state === "revoked"));
    assert.ok(sessions.json.sessions.some((session) => session.state === "active"));

    const logout = await apiRequest(server, "/auth/logout", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + refreshed.json.token,
      },
      json: {
        refresh_token: refreshed.json?.refresh_token,
      },
    });
    assert.equal(logout.status, 200);
    assert.equal(logout.json?.logged_out, true);

    const afterLogout = await apiRequest(server, "/state", {
      headers: {
        Authorization: "Bearer " + refreshed.json.token,
      },
    });
    assert.equal(afterLogout.status, 401);

    const refreshAfterLogout = await apiRequest(server, "/auth/refresh", {
      method: "POST",
      json: {
        refresh_token: refreshed.json?.refresh_token,
      },
    });
    assert.equal(refreshAfterLogout.status, 401);
    assert.equal(refreshAfterLogout.json?.error, "invalid_refresh_token");
  } finally {
    await server.stop();
  }
});

test("password reset and email verification flows work with inline debug tokens", async () => {
  const server = await startBackend({
    env: {
      AUTH_REQUIRE_EMAIL_VERIFIED: "1",
    },
  });
  try {
    const signup = await apiRequest(server, "/auth/signup", {
      method: "POST",
      json: {
        email: "verify@example.com",
        password: "verify-password-123",
      },
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.json?.verification_required, true);
    assert.ok(typeof signup.json?.debug_email_verification_token === "string" && signup.json.debug_email_verification_token.length > 20);

    const verify = await apiRequest(server, "/auth/verify_email", {
      method: "POST",
      json: {
        token: signup.json?.debug_email_verification_token,
      },
    });
    assert.equal(verify.status, 200);
    assert.equal(verify.json?.email_verified, true);
    assert.equal(verify.json?.user?.email_verified, true);

    const resetRequest = await apiRequest(server, "/auth/request_password_reset", {
      method: "POST",
      json: {
        email: "verify@example.com",
      },
    });
    assert.equal(resetRequest.status, 200);
    assert.ok(typeof resetRequest.json?.debug_password_reset_token === "string" && resetRequest.json.debug_password_reset_token.length > 20);

    const reset = await apiRequest(server, "/auth/reset_password", {
      method: "POST",
      json: {
        token: resetRequest.json?.debug_password_reset_token,
        new_password: "verify-password-456",
      },
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.json?.password_reset, true);

    const oldLogin = await apiRequest(server, "/auth/login", {
      method: "POST",
      json: {
        email: "verify@example.com",
        password: "verify-password-123",
      },
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await apiRequest(server, "/auth/login", {
      method: "POST",
      json: {
        email: "verify@example.com",
        password: "verify-password-456",
      },
    });
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.json?.user?.email_verified, true);
  } finally {
    await server.stop();
  }
});

test("apple sign-in creates and reconnects the same user through auth/apple", async () => {
  const appleSecret = "them-test-apple-secret";
  const server = await startBackend({
    env: {
      AUTH_APPLE_TEST_JWT_SECRET: appleSecret,
      AUTH_APPLE_AUDIENCE: "io.them.them",
      AUTH_REQUIRE_EMAIL_VERIFIED: "1",
    },
  });
  try {
    const firstIdentityToken = buildAppleTestIdentityToken({
      secret: appleSecret,
      audience: "io.them.them",
      subject: "apple-user-123",
      email: "apple.writer@example.com",
      emailVerified: true,
    });
    const firstSignIn = await apiRequest(server, "/auth/apple", {
      method: "POST",
      json: {
        identity_token: firstIdentityToken,
        email: "apple.writer@example.com",
      },
    });
    assert.equal(firstSignIn.status, 201);
    assert.equal(firstSignIn.json?.ok, true);
    assert.equal(firstSignIn.json?.user?.email, "apple.writer@example.com");
    assert.equal(firstSignIn.json?.user?.email_verified, true);
    assert.ok(typeof firstSignIn.json?.token === "string" && firstSignIn.json.token.length > 20);

    const secondIdentityToken = buildAppleTestIdentityToken({
      secret: appleSecret,
      audience: "io.them.them",
      subject: "apple-user-123",
      email: "",
      emailVerified: true,
    });
    const secondSignIn = await apiRequest(server, "/auth/apple", {
      method: "POST",
      json: {
        identity_token: secondIdentityToken,
      },
    });
    assert.equal(secondSignIn.status, 200);
    assert.equal(secondSignIn.json?.ok, true);
    assert.equal(
      secondSignIn.json?.user?.user_id,
      firstSignIn.json?.user?.user_id
    );
    assert.equal(secondSignIn.json?.user?.email, "apple.writer@example.com");
  } finally {
    await server.stop();
  }
});
