// T-user-auth-smoke-test — smoke coverage for backend/lib/user_auth.js.
//
// 780-line lib, tier-3 sensitive (gates the rest of the auth
// surface). This smoke test pins the export surface and the
// `createUserAuthSubsystem(...)` factory contract. Deeper behavior
// tests (signup → login → refresh → logout, password reset, Apple
// flow, session revoke) are deferred to follow-up PRs that supply
// the full crypto + persistence dep set.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPublicUser,
  buildManagedSession,
  createUserAuthSubsystem,
} from "../lib/user_auth.js";

test("[user-auth] canonical exports are functions", () => {
  assert.equal(typeof buildPublicUser, "function");
  assert.equal(typeof buildManagedSession, "function");
  assert.equal(typeof createUserAuthSubsystem, "function");
});

test("[user-auth] buildPublicUser strips sensitive fields", () => {
  const internal = {
    id: "u1",
    email: "a@b.com",
    passwordHash: "SECRET_HASH_DO_NOT_LEAK",
    salt: "SECRET_SALT_DO_NOT_LEAK",
    appleSubject: "apple_sub_xyz",
    createdAt: 1000,
  };
  const pub = buildPublicUser(internal);
  assert.ok(pub, "buildPublicUser returned falsy");
  const raw = JSON.stringify(pub);
  assert.ok(!raw.includes("SECRET_HASH_DO_NOT_LEAK"), "passwordHash leaked to public user");
  assert.ok(!raw.includes("SECRET_SALT_DO_NOT_LEAK"), "salt leaked to public user");
});

test("[user-auth] buildPublicUser tolerates null/missing user", () => {
  // Defensive: never throw on null/undefined.
  assert.doesNotThrow(() => buildPublicUser(null));
  assert.doesNotThrow(() => buildPublicUser(undefined));
});

test("[user-auth] createUserAuthSubsystem returns the canonical handler surface", () => {
  // Pass an empty options object — the subsystem may rely on
  // module-scoped state from user_store. We only assert the export
  // shape, not behavior of any individual handler.
  const subsystem = createUserAuthSubsystem({});
  const expectedHandlers = [
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
    "protectUserRoutes",
  ];
  for (const name of expectedHandlers) {
    assert.equal(typeof subsystem[name], "function", `subsystem.${name} missing`);
  }
});

test("[user-auth] buildManagedSession is callable and tolerates partial input", () => {
  assert.doesNotThrow(() => buildManagedSession(null));
  assert.doesNotThrow(() => buildManagedSession({}));
});
