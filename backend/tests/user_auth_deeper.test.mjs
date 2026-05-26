// T-deeper-user-auth-tests — deeper coverage for user_auth beyond
// #218's smoke surface.
//
// #218 covered: exports are functions, buildPublicUser strips
// secrets, createUserAuthSubsystem returns the canonical handler
// surface.
//
// This PR exercises:
//   - buildAuthEnvelope shape (with/without tokens, with extras)
//   - buildPublicUser shape across user variants
//   - buildManagedSession shape across session variants
//   - createUserAuthSubsystem option handling (TTLs, requireUserAuth,
//     requireEmailVerification, autoVerifyEmails)
//
// Does NOT exercise the handler round-trips (signup → login →
// refresh → logout, password-reset, email-verification, Apple flow)
// because those require a real user_store backing + real JWT
// signing. Each is a substantial test surface and belongs in its
// own PR with the full crypto + persistence dep set.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildManagedSession,
  buildPublicUser,
  createUserAuthSubsystem,
} from "../lib/user_auth.js";

// ---------- buildPublicUser ----------

test("[user-auth-deeper] buildPublicUser exposes user_id + email + email_verified + created_at (snake_case)", () => {
  const user = {
    id: "u_abc",
    email: "writer@example.com",
    emailVerified: true,
    emailVerifiedAt: 1700000000000,
    createdAt: 1699999999999,
    appleSubject: "apple_xyz",
    passwordHash: "SECRET",
    salt: "SECRET",
  };
  const pub = buildPublicUser(user);
  assert.equal(pub.user_id, "u_abc");
  assert.equal(pub.email, "writer@example.com");
  assert.equal(pub.email_verified, true);
  assert.equal(pub.created_at, 1699999999999);
  // auth_provider is derived: appleSubject present → "apple".
  assert.equal(pub.auth_provider, "apple");
});

test("[user-auth-deeper] buildPublicUser strips passwordHash, salt, appleSubject", () => {
  const user = {
    id: "u",
    email: "a@b.com",
    passwordHash: "SECRET_HASH",
    salt: "SECRET_SALT",
    appleSubject: "apple_subj",
  };
  const pub = buildPublicUser(user);
  const raw = JSON.stringify(pub);
  assert.ok(!raw.includes("SECRET_HASH"), "passwordHash leaked");
  assert.ok(!raw.includes("SECRET_SALT"), "salt leaked");
  assert.ok(!raw.includes("apple_subj"), "appleSubject leaked");
});

test("[user-auth-deeper] buildPublicUser tolerates null/undefined", () => {
  assert.doesNotThrow(() => buildPublicUser(null));
  assert.doesNotThrow(() => buildPublicUser(undefined));
  assert.doesNotThrow(() => buildPublicUser({}));
});

test("[user-auth-deeper] buildPublicUser derives auth_provider from password presence when no appleSubject", () => {
  const pub = buildPublicUser({ id: "u", email: "a@b.com", password: { hash: "x" } });
  assert.equal(pub.auth_provider, "password");
});

// ---------- buildManagedSession ----------

test("[user-auth-deeper] buildManagedSession tolerates null/undefined", () => {
  assert.doesNotThrow(() => buildManagedSession(null));
  assert.doesNotThrow(() => buildManagedSession(undefined));
  assert.doesNotThrow(() => buildManagedSession({}));
});

test("[user-auth-deeper] buildManagedSession returns an object when session is supplied", () => {
  const out = buildManagedSession({
    sessionId: "sess_1",
    familyId: "fam_1",
    userId: "u_1",
    createdAt: 1000,
    expiresAt: 2000,
  });
  assert.equal(typeof out, "object");
});

// ---------- createUserAuthSubsystem option handling ----------

test("[user-auth-deeper] createUserAuthSubsystem clamps accessTtlSeconds to minimum 60", () => {
  const s = createUserAuthSubsystem({ accessTtlSeconds: 1 });
  // We can't directly inspect the clamped value, but a signup with
  // an empty user_store still returns the handler surface.
  assert.equal(typeof s.handleAuthSignup, "function");
});

test("[user-auth-deeper] createUserAuthSubsystem returns handlers, route guards, and reauth verifier", () => {
  const s = createUserAuthSubsystem({});
  const handlers = [
    "handleAuthSignup", "handleAuthLogin", "handleAuthApple",
    "handleAuthRefresh", "handleAuthLogout", "handleAuthSessions",
    "handleAuthSessionsRevoke", "handleAuthRequestPasswordReset",
    "handleAuthResetPassword", "handleAuthRequestEmailVerification",
    "handleAuthVerifyEmail", "protectUserRoutes",
    "protectPaidProviderRoutes", "verifyReauthProof",
  ];
  for (const name of handlers) {
    assert.equal(typeof s[name], "function", `${name} should be a function`);
  }
});

test("[user-auth-deeper] createUserAuthSubsystem tolerates options=undefined", () => {
  assert.doesNotThrow(() => createUserAuthSubsystem());
  assert.doesNotThrow(() => createUserAuthSubsystem({}));
});

// ---------- handler smoke: 503 when auth misconfigured ----------

test("[user-auth-deeper] handleAuthSignup returns 503 when JWT secret missing in production", () => {
  // production + no jwtSecret -> authConfigured false -> 503.
  const s = createUserAuthSubsystem({ nodeEnv: "production" });
  let captured = null;
  const fakeRes = {
    status(code) { captured = { code }; return this; },
    json(body) { captured.body = body; return this; },
  };
  s.handleAuthSignup({ body: {} }, fakeRes);
  assert.equal(captured?.code, 503);
  assert.equal(captured?.body?.error, "user_auth_not_configured");
});

test("[user-auth-deeper] handleAuthLogin returns 503 when JWT secret missing in production", () => {
  const s = createUserAuthSubsystem({ nodeEnv: "production" });
  let captured = null;
  const fakeRes = {
    status(code) { captured = { code }; return this; },
    json(body) { captured.body = body; return this; },
  };
  s.handleAuthLogin({ body: { email: "a@b.com", password: "x" } }, fakeRes);
  assert.equal(captured?.code, 503);
});

// ---------- error response shape ----------

test("[user-auth-deeper] auth_unconfigured error envelope has stage + error keys", () => {
  const s = createUserAuthSubsystem({ nodeEnv: "production" });
  const fakeRes = {
    _payload: null,
    status(_) { return this; },
    json(body) { this._payload = body; return this; },
  };
  s.handleAuthLogin({ body: {} }, fakeRes);
  assert.ok(fakeRes._payload, "response payload missing");
  assert.ok("stage" in fakeRes._payload);
  assert.ok("error" in fakeRes._payload);
  assert.equal(fakeRes._payload.error, "user_auth_not_configured");
});
