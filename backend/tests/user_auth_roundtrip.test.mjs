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
import { createHash, generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import jwt from "jsonwebtoken";

import { createJsonPersistence } from "../lib/persistence_json.js";
import {
  authenticateUser,
  authSessionIdByTokenHash,
  authSessionsById,
  configureUserStore,
  emailVerificationTokensByHash,
  getAuthSessionByToken,
  getUserByEmail,
  loadUserStoreFromAdapter,
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

function tempPersistenceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "io-them-userauth-persistence-"));
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

function setupSubsystem(overrides = {}, userStoreOverrides = {}) {
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
    ...userStoreOverrides,
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

async function settleBefore(promise, timeoutMs) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve("timed_out"), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function sha256Base64Url(value) {
  return createHash("sha256")
    .update(String(value || ""), "utf8")
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildAppleRs256Fixture({
  kid = "apple-kid-1",
  subject = "apple-prod-user",
  email = "apple-prod@example.com",
  nonce = "nonce-123",
} = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = kid;
  jwk.alg = "RS256";
  jwk.use = "sig";
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign({
    iss: "https://appleid.apple.com",
    aud: "io.them.them",
    sub: subject,
    email,
    email_verified: true,
    nonce,
    iat: now,
    exp: now + 3600,
  }, privateKey, {
    algorithm: "RS256",
    keyid: kid,
  });
  return { jwk, token };
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

test("[user-auth-roundtrip] signup waits for canonical persistence before responding", async () => {
  let releasePersistence;
  let markPersistenceStarted;
  const persistenceGate = new Promise((resolve) => {
    releasePersistence = resolve;
  });
  const persistenceStarted = new Promise((resolve) => {
    markPersistenceStarted = resolve;
  });
  const auth = setupSubsystem({}, {
    persistence: {
      kind: "deferred-test",
      async put() {
        markPersistenceStarted();
        await persistenceGate;
      },
    },
  });
  const res = makeRes();
  const responsePromise = auth.handleAuthSignup(
    makeReq({ email: "durable@example.com", password: "validpass123" }),
    res,
  );

  await persistenceStarted;
  assert.equal(res._body, null, "signup must not answer while persistence is pending");

  releasePersistence();
  await responsePromise;
  assert.equal(res._status, 201);
  assert.ok(res._body.access_token);
  assert.ok(res._body.refresh_token);
});

test("[user-auth-roundtrip] signup fails closed when canonical persistence fails", async () => {
  let persistenceAvailable = false;
  const auth = setupSubsystem({}, {
    persistence: {
      kind: "failing-test",
      async put() {
        if (!persistenceAvailable) throw new Error("simulated persistence outage");
      },
    },
  });
  const res = makeRes();
  await auth.handleAuthSignup(
    makeReq({ email: "persistence-failure@example.com", password: "validpass123" }),
    res,
  );

  assert.equal(res._status, 503);
  assert.equal(res._body.error, "auth_persistence_failed");
  assert.equal(
    res._body.retryable,
    false,
    "a retry is not promised while the empty-store compensation is itself undurable",
  );
  assert.equal(res._body.access_token, undefined);
  assert.equal(res._body.refresh_token, undefined);
  assert.equal(res._body.debug_email_verification_token, undefined);
  assert.equal(getUserByEmail("persistence-failure@example.com"), null);

  persistenceAvailable = true;
  const retry = makeRes();
  await auth.handleAuthSignup(
    makeReq({ email: "persistence-failure@example.com", password: "validpass123" }),
    retry,
  );
  assert.equal(retry._status, 201, "the exact signup request must remain retryable");
  assert.ok(retry._body.access_token);
  assert.ok(retry._body.refresh_token);
});

test("[user-auth-roundtrip] completed signup restores without an explicit test flush", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPersistenceRoot() });
  try {
    const auth = setupSubsystem({}, { persistence });
    const signup = makeRes();
    await auth.handleAuthSignup(
      makeReq({ email: "restart@example.com", password: "validpass123" }),
      signup,
    );
    assert.equal(signup._status, 201);
    const refreshToken = signup._body.refresh_token;
    const userId = signup._body.user.user_id;

    resetState();
    assert.equal(await loadUserStoreFromAdapter(), true);
    assert.equal(getUserByEmail("restart@example.com")?.id, userId);
    assert.equal(getAuthSessionByToken(refreshToken)?.userId, userId);
  } finally {
    await persistence.close();
  }
});

test("[user-auth-roundtrip] refresh rotation and logout are durable when their handlers return", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPersistenceRoot() });
  try {
    const auth = setupSubsystem({}, { persistence });
    const signup = makeRes();
    await auth.handleAuthSignup(
      makeReq({ email: "rotation-restart@example.com", password: "validpass123" }),
      signup,
    );
    const originalRefreshToken = signup._body.refresh_token;

    const refresh = makeRes();
    await auth.handleAuthRefresh(makeReq({ refresh_token: originalRefreshToken }), refresh);
    assert.equal(refresh._status, 200);
    const rotatedRefreshToken = refresh._body.refresh_token;

    resetState();
    assert.equal(await loadUserStoreFromAdapter(), true);
    assert.equal(getAuthSessionByToken(originalRefreshToken), null);
    assert.ok(getAuthSessionByToken(originalRefreshToken, Date.now(), { includeRevoked: true }));
    assert.ok(getAuthSessionByToken(rotatedRefreshToken));

    const logout = makeRes();
    await auth.handleAuthLogout(makeReq({ refresh_token: rotatedRefreshToken }), logout);
    assert.equal(logout._status, 200);

    resetState();
    assert.equal(await loadUserStoreFromAdapter(), true);
    assert.equal(getAuthSessionByToken(rotatedRefreshToken), null);
    assert.ok(getAuthSessionByToken(rotatedRefreshToken, Date.now(), { includeRevoked: true }));
  } finally {
    await persistence.close();
  }
});

test("[user-auth-roundtrip] failed refresh restores live state without promising an undurable retry", async () => {
  const basePersistence = createJsonPersistence({ jsonRoot: tempPersistenceRoot() });
  let persistenceAvailable = true;
  const persistence = {
    ...basePersistence,
    kind: "recovering-test",
    async put(input) {
      if (!persistenceAvailable) throw new Error("simulated persistence outage");
      return basePersistence.put(input);
    },
  };
  try {
    const auth = setupSubsystem({}, { persistence });
    const signup = makeRes();
    await auth.handleAuthSignup(
      makeReq({ email: "refresh-retry@example.com", password: "validpass123" }),
      signup,
    );
    const originalRefreshToken = signup._body.refresh_token;

    persistenceAvailable = false;
    const failed = makeRes();
    await auth.handleAuthRefresh(makeReq({ refresh_token: originalRefreshToken }), failed);
    assert.equal(failed._status, 503);
    assert.equal(failed._body.retryable, false);
    assert.equal(failed._body.access_token, undefined);
    assert.equal(failed._body.refresh_token, undefined);
    assert.ok(getAuthSessionByToken(originalRefreshToken), "rollback must restore the original session");

    persistenceAvailable = true;
    const retry = makeRes();
    await auth.handleAuthRefresh(makeReq({ refresh_token: originalRefreshToken }), retry);
    assert.equal(retry._status, 200, "the exact refresh request must remain retryable");
    assert.ok(retry._body.refresh_token);

    resetState();
    assert.equal(await loadUserStoreFromAdapter(), true);
    assert.equal(getAuthSessionByToken(originalRefreshToken), null);
    assert.ok(getAuthSessionByToken(retry._body.refresh_token));
  } finally {
    await basePersistence.close();
  }
});

test("[user-auth-roundtrip] partial signup persistence never makes a false retry promise", async () => {
  const recordsByDomain = new Map();
  const domainRecords = (domain) => {
    if (!recordsByDomain.has(domain)) recordsByDomain.set(domain, new Map());
    return recordsByDomain.get(domain);
  };
  const persistence = {
    kind: "partial-failure-test",
    async put({ domain, key, value }) {
      if (domain === "auth_sessions") {
        throw new Error("simulated session write failure");
      }
      domainRecords(domain).set(key, structuredClone(value));
    },
    async list({ domain }) {
      return [...domainRecords(domain).entries()].map(([key, value]) => ({ key, value }));
    },
    async delete() {
      throw new Error("simulated compensation failure");
    },
  };
  const auth = setupSubsystem({}, { persistence });
  const failed = makeRes();
  await auth.handleAuthSignup(
    makeReq({ email: "partial-write@example.com", password: "validpass123" }),
    failed,
  );

  assert.equal(failed._status, 503);
  assert.equal(failed._body.error, "auth_persistence_failed");
  assert.equal(failed._body.retryable, false);
  assert.equal(failed._body.access_token, undefined);
  assert.equal(failed._body.refresh_token, undefined);
  assert.equal(getUserByEmail("partial-write@example.com"), null);

  resetState();
  assert.equal(await loadUserStoreFromAdapter(), true);
  assert.ok(
    getUserByEmail("partial-write@example.com"),
    "the test adapter retains the partial user write after failed compensation",
  );

  const retry = makeRes();
  await auth.handleAuthSignup(
    makeReq({ email: "partial-write@example.com", password: "validpass123" }),
    retry,
  );
  assert.equal(retry._status, 409);
  assert.equal(retry._body.error, "email_taken");
});

test("[user-auth-roundtrip] bearer reads wait for refresh rollback before authenticating", async () => {
  const basePersistence = createJsonPersistence({ jsonRoot: tempPersistenceRoot() });
  let failPersistence = false;
  let releaseFailure;
  let markPersistenceStarted;
  const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
  const persistenceStarted = new Promise((resolve) => { markPersistenceStarted = resolve; });
  const persistence = {
    ...basePersistence,
    kind: "deferred-failure-test",
    async put(input) {
      if (failPersistence) {
        markPersistenceStarted();
        await failureGate;
        throw new Error("simulated persistence outage");
      }
      return basePersistence.put(input);
    },
  };
  try {
    const auth = setupSubsystem({}, { persistence });
    const signup = makeRes();
    await auth.handleAuthSignup(
      makeReq({ email: "refresh-read-lock@example.com", password: "validpass123" }),
      signup,
    );

    failPersistence = true;
    const refresh = makeRes();
    const refreshPromise = auth.handleAuthRefresh(
      makeReq({ refresh_token: signup._body.refresh_token }),
      refresh,
    );
    await persistenceStarted;

    let attachCompleted = false;
    const bearerRequest = {
      body: {},
      headers: { authorization: "Bearer " + signup._body.access_token },
      get(name) {
        return String(name || "").toLowerCase() === "authorization"
          ? this.headers.authorization
          : undefined;
      },
    };
    const attachPromise = new Promise((resolve, reject) => {
      auth.attachUserAuth(bearerRequest, makeRes(), (error) => {
        if (error) return reject(error);
        attachCompleted = true;
        resolve();
      });
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(attachCompleted, false, "bearer verification must not observe transient rotation state");

    releaseFailure();
    await refreshPromise;
    await attachPromise;
    assert.equal(refresh._status, 503);
    assert.equal(bearerRequest.authUser?.email, "refresh-read-lock@example.com");
  } finally {
    await basePersistence.close();
  }
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

test("[user-auth-roundtrip] verifyReauthProof accepts only the current user's password", async () => {
  const auth = setupSubsystem();
  await auth.handleAuthSignup(makeReq({ email: "reauth@example.com", password: "validpass123" }), makeRes());
  const user = usersByEmail.get("reauth@example.com");
  assert.ok(user, "user should exist");

  assert.equal(
    await auth.verifyReauthProof(makeReq({ password: "validpass123" }), user),
    true,
  );
  assert.equal(
    await auth.verifyReauthProof(makeReq({ password: "wrong-password" }), user),
    false,
  );
  assert.equal(
    await auth.verifyReauthProof(makeReq({}), user),
    false,
  );
});

// ---------- password reset ----------

test("[user-auth-roundtrip] request_password_reset issues a debug token in non-production", async () => {
  const auth = setupSubsystem();
  await auth.handleAuthSignup(makeReq({ email: "reset@example.com", password: "validpass123" }), makeRes());

  const requestRes = makeRes();
  await auth.handleAuthRequestPasswordReset(makeReq({ email: "reset@example.com" }), requestRes);
  assert.ok(requestRes._status >= 200 && requestRes._status < 300);
  assert.equal(requestRes._body.user, null);
  // In non-production mode (nodeEnv=test), the debug token should appear.
  assert.ok(requestRes._body.debug_password_reset_token, `expected debug token in non-production, got: ${JSON.stringify(requestRes._body)}`);
});

test("[user-auth-roundtrip] production request_password_reset response does not reveal account existence", async () => {
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
  });
  await auth.handleAuthSignup(makeReq({ email: "known-reset@example.com", password: "validpass123" }), makeRes());

  const known = makeRes();
  await auth.handleAuthRequestPasswordReset(makeReq({ email: "known-reset@example.com" }), known);
  const unknown = makeRes();
  await auth.handleAuthRequestPasswordReset(makeReq({ email: "unknown-reset@example.com" }), unknown);

  assert.equal(known._status, 200);
  assert.equal(unknown._status, 200);
  assert.deepEqual(known._body, unknown._body);
  assert.equal(known._body.user, null);
  assert.equal(known._body.debug_password_reset_token, undefined);
});

test("[user-auth-roundtrip] staging request_password_reset does not expose debug reset tokens", async () => {
  const auth = setupSubsystem({
    nodeEnv: "staging",
    jwtSecret: "staging-jwt-secret-for-test",
  });
  await auth.handleAuthSignup(makeReq({ email: "staging-reset@example.com", password: "validpass123" }), makeRes());

  const res = makeRes();
  await auth.handleAuthRequestPasswordReset(makeReq({ email: "staging-reset@example.com" }), res);
  assert.equal(res._status, 200);
  assert.equal(res._body.debug_password_reset_token, undefined);
  assert.equal(res._body.user, null);
});

test("[user-auth-roundtrip] short replacement password does not consume the reset token", async () => {
  const auth = setupSubsystem();
  await auth.handleAuthSignup(
    makeReq({ email: "reset-retry@example.com", password: "validpass123" }),
    makeRes(),
  );
  const request = makeRes();
  await auth.handleAuthRequestPasswordReset(
    makeReq({ email: "reset-retry@example.com" }),
    request,
  );
  const resetToken = request._body.debug_password_reset_token;

  const rejected = makeRes();
  await auth.handleAuthResetPassword(
    makeReq({ token: resetToken, new_password: "short" }),
    rejected,
  );
  assert.equal(rejected._status, 400);
  assert.equal(rejected._body.error, "password_too_short");

  const retry = makeRes();
  await auth.handleAuthResetPassword(
    makeReq({ token: resetToken, new_password: "corrected-password-456" }),
    retry,
  );
  assert.equal(retry._status, 200, "correcting the password should reuse the same reset token");
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
  assert.ok(Number(resetRes._body.revoked_sessions || 0) >= 1);

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

test("[user-auth-roundtrip] verification and password reset are durable when handlers return", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPersistenceRoot() });
  try {
    const auth = setupSubsystem({ requireEmailVerification: true }, { persistence });
    const signup = makeRes();
    await auth.handleAuthSignup(
      makeReq({ email: "durable-recovery@example.com", password: "validpass123" }),
      signup,
    );
    const originalRefreshToken = signup._body.refresh_token;

    const verify = makeRes();
    await auth.handleAuthVerifyEmail(
      makeReq({ token: signup._body.debug_email_verification_token }),
      verify,
    );
    assert.equal(verify._status, 200);

    resetState();
    assert.equal(await loadUserStoreFromAdapter(), true);
    assert.equal(getUserByEmail("durable-recovery@example.com")?.emailVerified, true);

    const requestReset = makeRes();
    await auth.handleAuthRequestPasswordReset(
      makeReq({ email: "durable-recovery@example.com" }),
      requestReset,
    );
    const reset = makeRes();
    await auth.handleAuthResetPassword(
      makeReq({
        token: requestReset._body.debug_password_reset_token,
        new_password: "new-valid-pass-456",
      }),
      reset,
    );
    assert.equal(reset._status, 200);

    resetState();
    assert.equal(await loadUserStoreFromAdapter(), true);
    assert.equal(
      authenticateUser("durable-recovery@example.com", "new-valid-pass-456").ok,
      true,
    );
    assert.equal(
      authenticateUser("durable-recovery@example.com", "validpass123").ok,
      false,
    );
    assert.equal(getAuthSessionByToken(originalRefreshToken), null);
  } finally {
    await persistence.close();
  }
});

// ---------- Apple Sign In ----------

test("[user-auth-roundtrip] production Apple sign-in fails closed without a configured audience", async () => {
  const fixture = buildAppleRs256Fixture({
    kid: "apple-no-audience-kid",
    nonce: "apple-no-audience-nonce",
  });
  let jwksFetchCount = 0;
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
    appleAudience: "   ",
    fetchAppleJwks: async () => {
      jwksFetchCount += 1;
      return { keys: [fixture.jwk] };
    },
  });

  const res = makeRes();
  await auth.handleAuthApple(makeReq({
    identity_token: fixture.token,
    nonce: "apple-no-audience-nonce",
  }), res);

  assert.equal(res._status, 503);
  assert.equal(res._body.error, "apple_sign_in_not_configured");
  assert.equal(res._body.access_token, undefined);
  assert.equal(res._body.refresh_token, undefined);
  assert.equal(jwksFetchCount, 0, "misconfigured production auth must fail before token verification");
});

test("[user-auth-roundtrip] production Apple sign-in verifies JWKS kid and nonce", async () => {
  const fixture = buildAppleRs256Fixture({
    kid: "apple-prod-kid",
    subject: "apple-prod-subject",
    email: "apple-prod@example.com",
    nonce: "nonce-from-client",
  });
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
    appleAudience: "io.them.them",
    fetchAppleJwks: async () => ({ keys: [fixture.jwk] }),
  });

  const res = makeRes();
  await auth.handleAuthApple(makeReq({
    identity_token: fixture.token,
    nonce: "nonce-from-client",
  }), res);
  assert.equal(res._status, 201);
  assert.equal(res._body.user.email, "apple-prod@example.com");
  assert.equal(res._body.user.auth_provider, "apple");
});

test("[user-auth-roundtrip] production Apple sign-in rejects a token for another audience", async () => {
  const fixture = buildAppleRs256Fixture({
    kid: "apple-wrong-audience-kid",
    nonce: "apple-wrong-audience-nonce",
  });
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
    appleAudience: "io.them.some-other-app",
    fetchAppleJwks: async () => ({ keys: [fixture.jwk] }),
  });

  const res = makeRes();
  await auth.handleAuthApple(makeReq({
    identity_token: fixture.token,
    nonce: "apple-wrong-audience-nonce",
  }), res);

  assert.equal(res._status, 401);
  assert.equal(res._body.error, "invalid_apple_identity_token");
  assert.equal(res._body.access_token, undefined);
  assert.equal(res._body.refresh_token, undefined);
});

test("[user-auth-roundtrip] Apple request email cannot attach an unknown subject to a password account", async () => {
  const fixture = buildAppleRs256Fixture({
    kid: "apple-no-email-kid",
    subject: "attacker-apple-subject",
    email: "",
    nonce: "attacker-apple-nonce",
  });
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
    appleAudience: "io.them.them",
    fetchAppleJwks: async () => ({ keys: [fixture.jwk] }),
  });

  const signup = makeRes();
  await auth.handleAuthSignup(
    makeReq({ email: "victim@example.com", password: "validpass123" }),
    signup,
  );
  assert.equal(signup._status, 201);

  const apple = makeRes();
  await auth.handleAuthApple(makeReq({
    identity_token: fixture.token,
    nonce: "attacker-apple-nonce",
    email: "victim@example.com",
  }), apple);

  assert.equal(apple._status, 400);
  assert.equal(apple._body.error, "apple_email_required");
  assert.equal(apple._body.access_token, undefined);
  assert.equal(apple._body.refresh_token, undefined);
  assert.equal(getUserByEmail("victim@example.com")?.appleSubject, "");
  assert.equal(authenticateUser("victim@example.com", "validpass123").ok, true);
});

test("[user-auth-roundtrip] Apple sign-in cannot replace an email's existing Apple subject", async () => {
  const firstFixture = buildAppleRs256Fixture({
    kid: "apple-original-kid",
    subject: "apple-original-subject",
    email: "apple-linked@example.com",
    nonce: "apple-original-nonce",
  });
  const conflictingFixture = buildAppleRs256Fixture({
    kid: "apple-conflicting-kid",
    subject: "apple-conflicting-subject",
    email: "apple-linked@example.com",
    nonce: "apple-conflicting-nonce",
  });
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
    appleAudience: "io.them.them",
    fetchAppleJwks: async () => ({
      keys: [firstFixture.jwk, conflictingFixture.jwk],
    }),
  });

  const first = makeRes();
  await auth.handleAuthApple(makeReq({
    identity_token: firstFixture.token,
    nonce: "apple-original-nonce",
  }), first);
  assert.equal(first._status, 201);

  const conflicting = makeRes();
  await auth.handleAuthApple(makeReq({
    identity_token: conflictingFixture.token,
    nonce: "apple-conflicting-nonce",
  }), conflicting);

  assert.equal(conflicting._status, 409);
  assert.equal(conflicting._body.error, "apple_subject_taken");
  assert.equal(conflicting._body.access_token, undefined);
  assert.equal(
    getUserByEmail("apple-linked@example.com")?.appleSubject,
    "apple-original-subject",
  );
});

test("[user-auth-roundtrip] slow Apple JWKS discovery does not hold the auth mutation lock", async () => {
  const fixture = buildAppleRs256Fixture({
    kid: "apple-slow-kid",
    subject: "apple-slow-subject",
    email: "apple-slow@example.com",
    nonce: "apple-slow-nonce",
  });
  let releaseJwks;
  let markJwksStarted;
  const jwksGate = new Promise((resolve) => { releaseJwks = resolve; });
  const jwksStarted = new Promise((resolve) => { markJwksStarted = resolve; });
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
    appleAudience: "io.them.them",
    appleJwksTimeoutMs: 5_000,
    fetchAppleJwks: async () => {
      markJwksStarted();
      await jwksGate;
      return { keys: [fixture.jwk] };
    },
  });

  const signup = makeRes();
  await auth.handleAuthSignup(
    makeReq({ email: "existing-bearer@example.com", password: "validpass123" }),
    signup,
  );
  assert.equal(signup._status, 201);

  const apple = makeRes();
  const appleRequest = auth.handleAuthApple(makeReq({
    identity_token: fixture.token,
    nonce: "apple-slow-nonce",
  }), apple);
  await jwksStarted;

  const bearerReq = {
    body: {},
    headers: {},
    get(name) {
      return String(name || "").toLowerCase() === "authorization"
        ? `Bearer ${signup._body.access_token}`
        : undefined;
    },
  };
  const bearerResult = await settleBefore(
    new Promise((resolve, reject) => {
      auth.attachUserAuth(bearerReq, makeRes(), (error) => error ? reject(error) : resolve("attached"));
    }),
    1_000,
  );
  assert.equal(bearerResult, "attached");
  assert.equal(bearerReq.authUser?.email, "existing-bearer@example.com");

  const unrelatedSignup = makeRes();
  const signupResult = await settleBefore(
    auth.handleAuthSignup(
      makeReq({ email: "unrelated-signup@example.com", password: "validpass123" }),
      unrelatedSignup,
    ).then(() => "completed"),
    2_000,
  );
  assert.equal(signupResult, "completed");
  assert.equal(unrelatedSignup._status, 201);

  releaseJwks();
  await appleRequest;
  assert.equal(apple._status, 201);
});

test("[user-auth-roundtrip] Apple JWKS discovery has a bounded unavailable response", async () => {
  const fixture = buildAppleRs256Fixture({
    kid: "apple-timeout-kid",
    nonce: "apple-timeout-nonce",
  });
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
    appleAudience: "io.them.them",
    appleJwksTimeoutMs: 25,
    fetchAppleJwks: async () => new Promise(() => {}),
  });

  const res = makeRes();
  await auth.handleAuthApple(makeReq({
    identity_token: fixture.token,
    nonce: "apple-timeout-nonce",
  }), res);
  assert.equal(res._status, 503);
  assert.equal(res._body.error, "apple_jwks_unavailable");
});

test("[user-auth-roundtrip] production Apple sign-in accepts raw nonce by comparing its SHA-256 claim", async () => {
  const rawNonce = "raw-client-nonce";
  const fixture = buildAppleRs256Fixture({
    kid: "apple-raw-nonce-kid",
    nonce: sha256Base64Url(rawNonce),
  });
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
    appleAudience: "io.them.them",
    fetchAppleJwks: async () => ({ keys: [fixture.jwk] }),
  });

  const res = makeRes();
  await auth.handleAuthApple(makeReq({
    identity_token: fixture.token,
    raw_nonce: rawNonce,
  }), res);
  assert.equal(res._status, 201);
});

test("[user-auth-roundtrip] production Apple sign-in rejects mismatched nonce", async () => {
  const fixture = buildAppleRs256Fixture({
    kid: "apple-prod-kid",
    nonce: "expected-nonce",
  });
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
    appleAudience: "io.them.them",
    fetchAppleJwks: async () => ({ keys: [fixture.jwk] }),
  });

  const res = makeRes();
  await auth.handleAuthApple(makeReq({
    identity_token: fixture.token,
    nonce: "wrong-nonce",
  }), res);
  assert.equal(res._status, 401);
  assert.equal(res._body.error, "invalid_apple_nonce");
});

test("[user-auth-roundtrip] production Apple sign-in ignores AUTH_APPLE_TEST_JWT_SECRET", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign({
    iss: "https://appleid.apple.com",
    aud: "io.them.them",
    sub: "apple-hmac-subject",
    nonce: "nonce-from-client",
    iat: now,
    exp: now + 3600,
  }, "apple-test-secret", {
    algorithm: "HS256",
    keyid: "test",
  });
  const auth = setupSubsystem({
    nodeEnv: "production",
    jwtSecret: "production-jwt-secret-for-test",
    appleAudience: "io.them.them",
    appleTestJwtSecret: "apple-test-secret",
    fetchAppleJwks: async () => ({ keys: [] }),
  });

  const res = makeRes();
  await auth.handleAuthApple(makeReq({
    identity_token: token,
    nonce: "nonce-from-client",
  }), res);
  assert.equal(res._status, 401);
  assert.equal(res._body.error, "invalid_apple_identity_token");
});
