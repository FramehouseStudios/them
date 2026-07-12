// T-deeper-lib-tests-batch — deeper direct tests for
// backend/lib/user_store.js beyond #217's smoke surface.
//
// Covers the actual user + auth-session lifecycle:
//   - createUser happy path + email-taken + password-too-short.
//   - createOrAttachAppleUser fresh + attach-to-existing-email.
//   - authenticateUser happy + not-found + invalid-password.
//   - issueAuthSession returns a refresh token + session record.
//   - getAuthSessionByToken round-trip.
//   - rotateAuthSession produces a fresh token + invalidates the
//     previous one in the same family.
//   - revokeAuthSessionById + revokeAuthSessionByToken +
//     revokeAllAuthSessionsForUser.
//   - markUserEmailVerified.
//
// Stubs persistence (in-memory fs mock) so tests don't touch disk.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  authenticateUser,
  authSessionIdByTokenHash,
  authSessionsById,
  configureUserStore,
  createOrAttachAppleUser,
  createUser,
  deleteUserById,
  emailVerificationTokensByHash,
  getAuthSessionById,
  getAuthSessionByToken,
  getUserByAppleSubject,
  getUserByEmail,
  getUserById,
  issueAuthSession,
  markUserEmailVerified,
  passwordResetTokensByHash,
  revokeAllAuthSessionsForUser,
  revokeAuthSessionById,
  revokeAuthSessionByToken,
  rotateAuthSession,
  usersByAppleSubject,
  usersByEmail,
  usersById,
} from "../lib/user_store.js";

function tempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-user-store-deeper-"));
  return path.join(dir, "users.json");
}

function setupStore() {
  // Drain all in-memory state between tests.
  usersById.clear();
  usersByEmail.clear();
  usersByAppleSubject.clear();
  authSessionsById.clear();
  authSessionIdByTokenHash.clear();
  emailVerificationTokensByHash.clear();
  passwordResetTokensByHash.clear();

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
}

test("[user-store-deeper] deleteUserById removes identity, sessions, and lookup indexes", async () => {
  setupStore();
  const created = createUser({ email: "erase@example.com", password: "password-123" });
  const session = issueAuthSession({ userId: created.user.id });

  const receipt = await deleteUserById(created.user.id);

  assert.equal(receipt.ok, true);
  assert.equal(receipt.deleted, true);
  assert.equal(receipt.deletedSessions, 1);
  assert.equal(getUserById(created.user.id), null);
  assert.equal(getUserByEmail("erase@example.com"), null);
  assert.equal(getAuthSessionByToken(session.refreshToken), null);
});

// ---------- createUser ----------

test("[user-store-deeper] createUser rejects missing email", () => {
  setupStore();
  const r = createUser({ password: "secret123" });
  assert.equal(r.ok, false);
  assert.equal(r.status, "email_required");
});

test("[user-store-deeper] createUser rejects short password", () => {
  setupStore();
  const r = createUser({ email: "a@b.com", password: "short" });
  assert.equal(r.ok, false);
  assert.equal(r.status, "password_too_short");
});

test("[user-store-deeper] createUser succeeds with valid input", () => {
  setupStore();
  const r = createUser({ email: "a@b.com", password: "longenough" });
  assert.equal(r.ok, true);
  assert.ok(r.user.id);
  assert.equal(r.user.email, "a@b.com");
  assert.ok(r.user.password); // password record was created
  // Round-trip via getUserByEmail.
  const fetched = getUserByEmail("a@b.com");
  assert.equal(fetched.id, r.user.id);
});

test("[user-store-deeper] createUser refuses duplicate email", () => {
  setupStore();
  createUser({ email: "dup@b.com", password: "longenough" });
  const r = createUser({ email: "dup@b.com", password: "another1" });
  assert.equal(r.ok, false);
  assert.equal(r.status, "email_taken");
});

// ---------- createOrAttachAppleUser ----------

test("[user-store-deeper] createOrAttachAppleUser creates a new apple user", () => {
  setupStore();
  const r = createOrAttachAppleUser({
    appleSubject: "apple_abc",
    email: "apple@b.com",
    emailVerified: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.user.appleSubject, "apple_abc");
  assert.equal(r.user.email, "apple@b.com");
});

test("[user-store-deeper] createOrAttachAppleUser attaches to existing password user with matching email", () => {
  setupStore();
  const password = createUser({ email: "shared@b.com", password: "longenough" });
  const r = createOrAttachAppleUser({
    appleSubject: "apple_xyz",
    email: "shared@b.com",
  });
  assert.equal(r.ok, true);
  // Same id as the password user.
  assert.equal(r.user.id, password.user.id);
  // Apple subject is now attached.
  assert.equal(r.user.appleSubject, "apple_xyz");
});

// ---------- authenticateUser ----------

test("[user-store-deeper] authenticateUser returns ok for valid credentials", () => {
  setupStore();
  createUser({ email: "auth@b.com", password: "rightpassword" });
  const r = authenticateUser("auth@b.com", "rightpassword");
  assert.equal(r.ok, true);
  assert.equal(r.user.email, "auth@b.com");
});

test("[user-store-deeper] authenticateUser rejects unknown email", () => {
  setupStore();
  const r = authenticateUser("missing@b.com", "anything");
  assert.equal(r.ok, false);
  assert.equal(r.status, "not_found");
});

test("[user-store-deeper] authenticateUser rejects wrong password", () => {
  setupStore();
  createUser({ email: "auth2@b.com", password: "rightpassword" });
  const r = authenticateUser("auth2@b.com", "wrongpassword");
  assert.equal(r.ok, false);
  assert.equal(r.status, "invalid_password");
});

// ---------- issueAuthSession + lookup ----------

test("[user-store-deeper] issueAuthSession returns a session + refresh token round-trippable by token", () => {
  setupStore();
  const user = createUser({ email: "sess@b.com", password: "longenough" });
  const issued = issueAuthSession({ userId: user.user.id, ttlMs: 60_000 });
  assert.ok(issued.session.sessionId);
  assert.ok(issued.refreshToken);
  // Token round-trip.
  const fetched = getAuthSessionByToken(issued.refreshToken);
  assert.equal(fetched.sessionId, issued.session.sessionId);
});

test("[user-store-deeper] getAuthSessionByToken returns null for unknown token", () => {
  setupStore();
  assert.equal(getAuthSessionByToken("never_issued"), null);
});

// ---------- rotateAuthSession ----------

test("[user-store-deeper] rotateAuthSession returns a new token and invalidates the previous one", () => {
  setupStore();
  const user = createUser({ email: "rot@b.com", password: "longenough" });
  const first = issueAuthSession({ userId: user.user.id, ttlMs: 60_000 });
  const rotated = rotateAuthSession(first.refreshToken, { ttlMs: 60_000 });
  assert.ok(rotated.session.sessionId);
  assert.notEqual(rotated.refreshToken, first.refreshToken);
  // Family id is preserved across rotation.
  assert.equal(rotated.session.familyId, first.session.familyId);
  // First refresh token no longer resolves (revoked).
  const stale = getAuthSessionByToken(first.refreshToken);
  // Either null or returns a revoked record; tolerate both.
  if (stale) assert.ok(stale.revokedAt > 0, "stale session must be revoked");
});

// ---------- revoke ----------

test("[user-store-deeper] revokeAuthSessionById marks session revoked", () => {
  setupStore();
  const user = createUser({ email: "rev@b.com", password: "longenough" });
  const issued = issueAuthSession({ userId: user.user.id, ttlMs: 60_000 });
  const revoked = revokeAuthSessionById(issued.session.sessionId);
  assert.ok(revoked.revokedAt > 0);
  // Subsequent get without includeRevoked → null.
  assert.equal(getAuthSessionById(issued.session.sessionId), null);
  // With includeRevoked → returns the record.
  assert.ok(getAuthSessionById(issued.session.sessionId, Date.now(), { includeRevoked: true }));
});

test("[user-store-deeper] revokeAuthSessionByToken matches the right session", () => {
  setupStore();
  const user = createUser({ email: "revt@b.com", password: "longenough" });
  const issued = issueAuthSession({ userId: user.user.id, ttlMs: 60_000 });
  const revoked = revokeAuthSessionByToken(issued.refreshToken);
  assert.equal(revoked.sessionId, issued.session.sessionId);
});

test("[user-store-deeper] revokeAllAuthSessionsForUser revokes every session for a user", () => {
  setupStore();
  const user = createUser({ email: "revall@b.com", password: "longenough" });
  const s1 = issueAuthSession({ userId: user.user.id, ttlMs: 60_000 });
  const s2 = issueAuthSession({ userId: user.user.id, ttlMs: 60_000 });
  const revoked = revokeAllAuthSessionsForUser(user.user.id);
  assert.equal(revoked.length, 2);
  assert.equal(getAuthSessionById(s1.session.sessionId), null);
  assert.equal(getAuthSessionById(s2.session.sessionId), null);
});

test("[user-store-deeper] revokeAllAuthSessionsForUser supports exceptSessionId", () => {
  setupStore();
  const user = createUser({ email: "revexcept@b.com", password: "longenough" });
  const keep = issueAuthSession({ userId: user.user.id, ttlMs: 60_000 });
  const drop = issueAuthSession({ userId: user.user.id, ttlMs: 60_000 });
  const revoked = revokeAllAuthSessionsForUser(user.user.id, Date.now(), {
    exceptSessionId: keep.session.sessionId,
  });
  assert.equal(revoked.length, 1);
  assert.ok(getAuthSessionById(keep.session.sessionId));
  assert.equal(getAuthSessionById(drop.session.sessionId), null);
});

// ---------- markUserEmailVerified ----------

test("[user-store-deeper] markUserEmailVerified flips the user record", () => {
  setupStore();
  const r = createUser({ email: "verify@b.com", password: "longenough" });
  assert.equal(r.user.emailVerified, false);
  const updated = markUserEmailVerified(r.user.id);
  assert.equal(updated.emailVerified, true);
  assert.ok(updated.emailVerifiedAt > 0);
});

test("[user-store-deeper] markUserEmailVerified returns null for unknown userId", () => {
  setupStore();
  assert.equal(markUserEmailVerified("never_existed"), null);
});
