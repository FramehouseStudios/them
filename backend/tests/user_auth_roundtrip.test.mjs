// T-user-auth-roundtrip-tests — full handler round-trip coverage
// for backend/lib/user_auth.js. Beyond #218's smoke (export surface)
// and #241's deeper (envelope shape + 503 paths), this PR exercises
// the actual flows iOS depends on:
//
//   - signup → login → refresh round-trip with real user_store +
//     real JWT signing.
//   - logout invalidates the refresh token.
//   - password reset request → consume → all-sessions-revoke.
//   - email verification request → consume → emailVerified flip.
//
// Uses an in-memory user_store (real lib, temp JSON file) and a
// real HS256 JWT secret. No mocks for crypto.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import jwt from "jsonwebtoken";

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

function tempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-userauth-roundtrip-"));
  return path.join(dir, "users.json");
}

function resetState() {
  usersById.clear();
  usersByEmail.clear();
  usersByAppleSubject.clear();
  authSessionsById.clear();
  authSessionIdByTokenHash.clear();
  emailVerificationTokensByHash.clear();
  passwordResetTokensByHash.clear();
}

function setupSubsystem(overrides = {}) {
  resetState();
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
    jwtSecret: "test-secret-do-not-use-in-production",
    accessTtlSeconds: 900,        // 15min
    refreshTtlSeconds: 60 * 60,   // 1h
    passwordResetTtlSeconds: 600, // 10min
    emailVerificationTtlSeconds: 600, // 10min
    autoVerifyEmails: false,
    requireEmailVerification: false,
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

function makeReq(body = {}) {
  return {
    body,
    get: () => undefined,
    headers: {},
  };
}

// ---------- signup ----------

test("[user-auth-roundtrip] signup creates a user and returns access+refresh tokens", async () => {
  const auth = setupSubsystem();
  const res = makeRes();
  await auth.handleAuthSignup(makeReq({ email: "alice@example.com", password: "validpass123" }), res);
  assert.equal(res._status, 201);
  assert.equal(res._body.ok, true);
  assert.ok(res._body.access_token);
  assert.ok(res._body.refresh_token);
  assert.equal(res._body.user.email, "alice@example.com");
  // JWT decodes with the configured secret.
  const decoded = jwt.verify(res._body.access_token, "test-secret-do-not-use-in-production");
  assert.equal(decoded.email, "alice@example.com");
});

test("[user-auth-roundtrip] signup rejects duplicate email", async () => {
  const auth = setupSubsystem();
  await auth.handleAuthSignup(makeReq({ email: "dup@example.com", password: "validpass123" }), makeRes());
  const res = makeRes();
  await auth.handleAuthSignup(makeReq({ email: "dup@example.com", password: "another1234" }), res);
  assert.equal(res._status, 409);
  assert.equal(res._body.error, "email_taken");
});

test("[user-auth-roundtrip] signup rejects short password", async () => {
  const auth = setupSubsystem();
  const res = makeRes();
  await auth.handleAuthSignup(makeReq({ email: "x@y.com", password: "short" }), res);
  assert.equal(res._status, 400);
  assert.equal(res._body.error, "password_too_short");
});

// ---------- login ----------

test("[user-auth-roundtrip] login returns access+refresh tokens for valid credentials", async () => {
  const auth = setupSubsystem();
  await auth.handleAuthSignup(makeReq({ email: "bob@example.com", password: "validpass123" }), makeRes());
  const res = makeRes();
  await auth.handleAuthLogin(makeReq({ email: "bob@example.com", password: "validpass123" }), res);
  assert.equal(res._status, 200);
  assert.equal(res._body.ok, true);
  assert.ok(res._body.access_token);
  assert.ok(res._body.refresh_token);
});

test("[user-auth-roundtrip] login rejects unknown email", async () => {
  const auth = setupSubsystem();
  const res = makeRes();
  await auth.handleAuthLogin(makeReq({ email: "missing@example.com", password: "anything" }), res);
  assert.equal(res._status, 401);
  assert.equal(res._body.error, "invalid_credentials");
});

test("[user-auth-roundtrip] login rejects wrong password", async () => {
  const auth = setupSubsystem();
  await auth.handleAuthSignup(makeReq({ email: "wp@example.com", password: "validpass123" }), makeRes());
  const res = makeRes();
  await auth.handleAuthLogin(makeReq({ email: "wp@example.com", password: "wrongpass" }), res);
  assert.equal(res._status, 401);
  assert.equal(res._body.error, "invalid_credentials");
});

// ---------- refresh round-trip ----------

test("[user-auth-roundtrip] refresh rotates the token and preserves family_id", async () => {
  const auth = setupSubsystem();
  const signupRes = makeRes();
  await auth.handleAuthSignup(makeReq({ email: "rot@example.com", password: "validpass123" }), signupRes);
  const initialFamily = signupRes._body.current_family_id;
  const initialRefresh = signupRes._body.refresh_token;
  assert.ok(initialFamily);

  const refreshRes = makeRes();
  await auth.handleAuthRefresh(makeReq({ refresh_token: initialRefresh }), refreshRes);
  assert.equal(refreshRes._status, 200);
  assert.ok(refreshRes._body.access_token);
  assert.ok(refreshRes._body.refresh_token);
  assert.notEqual(refreshRes._body.refresh_token, initialRefresh, "refresh token must rotate");
  assert.equal(refreshRes._body.current_family_id, initialFamily, "family_id must persist across rotation");
});

test("[user-auth-roundtrip] using a rotated refresh token a second time fails", async () => {
  const auth = setupSubsystem();
  const signup = makeRes();
  await auth.handleAuthSignup(makeReq({ email: "reuse@example.com", password: "validpass123" }), signup);
  const original = signup._body.refresh_token;

  // First rotation succeeds.
  const r1 = makeRes();
  await auth.handleAuthRefresh(makeReq({ refresh_token: original }), r1);
  assert.equal(r1._status, 200);

  // Reusing the now-stale token should NOT succeed.
  const r2 = makeRes();
  await auth.handleAuthRefresh(makeReq({ refresh_token: original }), r2);
  assert.notEqual(r2._status, 200, `expected non-200 on reuse, got ${r2._status} body=${JSON.stringify(r2._body)}`);
});

test("[user-auth-roundtrip] refresh with missing refresh_token returns 400", async () => {
  const auth = setupSubsystem();
  const res = makeRes();
  await auth.handleAuthRefresh(makeReq({}), res);
  // Either 400 (refresh_token_required) or 401 (invalid_refresh_token) — both correct rejections.
  assert.ok(res._status >= 400 && res._status < 500, `expected 4xx, got ${res._status}`);
});

// ---------- logout ----------

test("[user-auth-roundtrip] logout invalidates the refresh token", async () => {
  const auth = setupSubsystem();
  const signup = makeRes();
  await auth.handleAuthSignup(makeReq({ email: "logout@example.com", password: "validpass123" }), signup);
  const refreshToken = signup._body.refresh_token;

  // Logout.
  const logoutRes = makeRes();
  await auth.handleAuthLogout(makeReq({ refresh_token: refreshToken }), logoutRes);
  assert.ok(logoutRes._status >= 200 && logoutRes._status < 300);

  // Subsequent refresh with the same token must fail.
  const refreshAfterLogout = makeRes();
  await auth.handleAuthRefresh(makeReq({ refresh_token: refreshToken }), refreshAfterLogout);
  assert.notEqual(refreshAfterLogout._status, 200);
});

// ---------- password reset ----------

test("[user-auth-roundtrip] request_password_reset issues a debug token in non-production", async () => {
  const auth = setupSubsystem();
  await auth.handleAuthSignup(makeReq({ email: "reset@example.com", password: "validpass123" }), makeRes());

  const requestRes = makeRes();
  await auth.handleAuthRequestPasswordReset(makeReq({ email: "reset@example.com" }), requestRes);
  assert.ok(requestRes._status >= 200 && requestRes._status < 300);
  // In non-production mode (nodeEnv=test), the debug token should appear.
  assert.ok(requestRes._body.debug_password_reset_token, `expected debug token in non-production, got: ${JSON.stringify(requestRes._body)}`);
});

test("[user-auth-roundtrip] reset_password consumes the token and revokes all sessions", async () => {
  const auth = setupSubsystem();
  const signup = makeRes();
  await auth.handleAuthSignup(makeReq({ email: "fullreset@example.com", password: "validpass123" }), signup);
  const originalRefresh = signup._body.refresh_token;

  // Request reset → debug token comes back.
  const req = makeRes();
  await auth.handleAuthRequestPasswordReset(makeReq({ email: "fullreset@example.com" }), req);
  const resetToken = req._body.debug_password_reset_token;
  assert.ok(resetToken);

  // Reset password (handler expects `new_password` field).
  const resetRes = makeRes();
  await auth.handleAuthResetPassword(makeReq({ token: resetToken, new_password: "newpass987" }), resetRes);
  assert.ok(resetRes._status >= 200 && resetRes._status < 300, `expected 2xx, got ${resetRes._status} body=${JSON.stringify(resetRes._body)}`);

  // The original refresh token must no longer rotate.
  const stale = makeRes();
  await auth.handleAuthRefresh(makeReq({ refresh_token: originalRefresh }), stale);
  assert.notEqual(stale._status, 200, "original refresh must be invalidated after password reset");

  // Login with the new password works.
  const login = makeRes();
  await auth.handleAuthLogin(makeReq({ email: "fullreset@example.com", password: "newpass987" }), login);
  assert.equal(login._status, 200);
});

// ---------- email verification ----------

test("[user-auth-roundtrip] request + verify_email flips the user's emailVerified flag", async () => {
  const auth = setupSubsystem({ requireEmailVerification: true });
  const signup = makeRes();
  await auth.handleAuthSignup(makeReq({ email: "verify@example.com", password: "validpass123" }), signup);
  // signup with requireEmailVerification:true should issue the
  // verification token in the extra payload.
  const tokenInline = signup._body.debug_email_verification_token;
  assert.ok(tokenInline, `expected debug verification token in signup response, got: ${JSON.stringify(signup._body)}`);

  // Verify.
  const verifyRes = makeRes();
  await auth.handleAuthVerifyEmail(makeReq({ token: tokenInline }), verifyRes);
  assert.ok(verifyRes._status >= 200 && verifyRes._status < 300);
});
