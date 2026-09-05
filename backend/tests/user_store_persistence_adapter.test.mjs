import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createJsonPersistence } from "../lib/persistence_json.js";
import {
  authSessionIdByTokenHash,
  authSessionsById,
  configureUserStore,
  consumePasswordResetToken,
  createUser,
  emailVerificationTokensByHash,
  flushUserStorePersistenceWrites,
  getAuthSessionByToken,
  getUserByEmail,
  issueAuthSession,
  issuePasswordResetToken,
  loadUserStoreFromAdapter,
  loadUserStore,
  passwordResetTokensByHash,
  revokeAllAuthSessionsForUserDurably,
  saveUserStore,
  usersByAppleSubject,
  usersByEmail,
  usersById,
} from "../lib/user_store.js";

const TEST_PASSWORD_SALT = "a".repeat(32);
const TEST_PASSWORD_HASH = "b".repeat(64);

function tempPath(prefix, filename = "") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return filename ? path.join(dir, filename) : dir;
}

function clearUserStoreMaps() {
  usersById.clear();
  usersByEmail.clear();
  usersByAppleSubject.clear();
  authSessionsById.clear();
  authSessionIdByTokenHash.clear();
  emailVerificationTokensByHash.clear();
  passwordResetTokensByHash.clear();
}

function configureTestStore(persistence, userStorePath = tempPath("io-them-auth-store-", "user_store.json")) {
  clearUserStoreMaps();
  configureUserStore({
    USER_STORE_PATH: userStorePath,
    fs,
    normalizeSnippet: (value, max = 160) => String(value || "").trim().slice(0, max),
    persistence,
    writeJsonFileAtomic: (filePath, payload) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      return true;
    },
  });
  return userStorePath;
}

function withOneShotPutFailure(persistence) {
  let failPredicate = null;
  return {
    ...persistence,
    failNextPutWhen(predicate) {
      failPredicate = predicate;
    },
    async put(input) {
      if (failPredicate?.(input)) {
        failPredicate = null;
        throw new Error("simulated one-shot persistence failure");
      }
      return persistence.put(input);
    },
  };
}

function createPaginatedMemoryPersistence(initialRowsByDomain = {}) {
  const stores = new Map();
  const listCalls = [];
  for (const [domain, rows] of Object.entries(initialRowsByDomain)) {
    stores.set(domain, new Map(
      (rows || []).map((row) => [String(row.key), row.value])
    ));
  }
  const domainStore = (domain) => {
    if (!stores.has(domain)) stores.set(domain, new Map());
    return stores.get(domain);
  };
  return {
    kind: "paginated-memory-test",
    listCalls,
    async put({ domain, key, value }) {
      domainStore(domain).set(String(key), value);
    },
    async delete({ domain, key }) {
      domainStore(domain).delete(String(key));
    },
    async list({ domain, afterKey = "", limit = 1000 }) {
      listCalls.push({ domain, afterKey, limit });
      return [...domainStore(domain).entries()]
        .filter(([key]) => !afterKey || key > afterKey)
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, limit)
        .map(([key, value]) => ({ key, value }));
    },
    keys(domain) {
      return [...domainStore(domain).keys()].sort();
    },
  };
}

function canonicalMarkerRow(value = { schemaVersion: 1, initialized: true }) {
  return { key: "canonical_state", value };
}

function adapterPasswordUser(id, email, overrides = {}) {
  return {
    key: id,
    value: {
      id,
      email,
      authProvider: "password",
      appleSubject: "",
      password: {
        salt: TEST_PASSWORD_SALT,
        hash: TEST_PASSWORD_HASH,
        iterations: 120000,
      },
      createdAt: 1_000,
      updatedAt: 1_000,
      ...overrides,
    },
  };
}

function seedLiveAuthSentinel() {
  const user = {
    id: "user-live-sentinel",
    email: "live-sentinel@example.com",
    appleSubject: "live-apple-subject",
    password: null,
  };
  const session = {
    sessionId: "session-live-sentinel",
    familyId: "family-live-sentinel",
    userId: user.id,
    tokenHash: "token-live-sentinel",
    expiresAt: 8_000_000_000_000,
    revokedAt: 0,
  };
  usersById.set(user.id, user);
  usersByEmail.set(user.email, user);
  usersByAppleSubject.set(user.appleSubject, user);
  authSessionsById.set(session.sessionId, session);
  authSessionIdByTokenHash.set(session.tokenHash, session.sessionId);
  passwordResetTokensByHash.set("reset-live-sentinel", {
    tokenHash: "reset-live-sentinel",
    userId: user.id,
    expiresAt: 8_000_000_000_000,
    usedAt: 0,
  });
  emailVerificationTokensByHash.set("verify-live-sentinel", {
    tokenHash: "verify-live-sentinel",
    userId: user.id,
    expiresAt: 8_000_000_000_000,
    usedAt: 0,
  });
  return { user, session };
}

async function assertInvalidCanonicalHydrationPreservesLiveState(initialRowsByDomain, messagePattern) {
  const persistence = createPaginatedMemoryPersistence(initialRowsByDomain);
  configureTestStore(persistence);
  const sentinel = seedLiveAuthSentinel();

  await assert.rejects(
    loadUserStoreFromAdapter(),
    (error) => {
      assert.equal(error?.code, "USER_STORE_ADAPTER_INVALID");
      assert.match(String(error?.message || ""), messagePattern);
      return true;
    },
  );

  assert.equal(usersById.get(sentinel.user.id), sentinel.user);
  assert.equal(usersByEmail.get(sentinel.user.email), sentinel.user);
  assert.equal(usersByAppleSubject.get(sentinel.user.appleSubject), sentinel.user);
  assert.equal(authSessionsById.get(sentinel.session.sessionId), sentinel.session);
  assert.equal(
    authSessionIdByTokenHash.get(sentinel.session.tokenHash),
    sentinel.session.sessionId,
  );
  assert.equal(passwordResetTokensByHash.has("reset-live-sentinel"), true);
  assert.equal(emailVerificationTokensByHash.has("verify-live-sentinel"), true);
}

test("[user-store-persistence] writes auth records to adapter and restores them", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPath("io-them-auth-persistence-") });
  try {
    configureTestStore(persistence);
    const created = createUser({ email: "writer@example.com", password: "longenough" });
    assert.equal(created.ok, true);
    const issued = issueAuthSession({ userId: created.user.id, ttlMs: 60_000 });
    assert.ok(issued.refreshToken);
    const flushed = await flushUserStorePersistenceWrites();
    assert.equal(flushed.ok, true);
    assert.equal(flushed.persistenceStatus, "ok");

    clearUserStoreMaps();
    const loaded = await loadUserStoreFromAdapter();
    assert.equal(loaded, true);
    assert.equal(getUserByEmail("writer@example.com")?.id, created.user.id);
    assert.equal(getAuthSessionByToken(issued.refreshToken)?.sessionId, issued.session.sessionId);
  } finally {
    await persistence.close();
  }
});

test("[user-store-persistence] canonical hydration rejects structural corruption without mutating live auth", async (t) => {
  await t.test("unsupported marker value", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_store_meta: [canonicalMarkerRow({ schemaVersion: 2, initialized: true })],
    }, /marker has an unsupported value or schema version/);
  });

  await t.test("markerless partial canonical state", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-markerless", "markerless@example.com")],
    }, /canonical auth marker is missing/);
  });

  await t.test("row key does not match embedded identity", async () => {
    const user = adapterPasswordUser("user-value", "mismatch@example.com");
    user.key = "user-row-key";
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [user],
      auth_store_meta: [canonicalMarkerRow()],
    }, /row key .* does not match embedded key/);
  });

  await t.test("array embedded identity cannot stringify into a user id", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [{
        ...adapterPasswordUser("user-array-id", "array-id@example.com"),
        value: {
          ...adapterPasswordUser("user-array-id", "array-id@example.com").value,
          id: ["user-array-id"],
        },
      }],
      auth_store_meta: [canonicalMarkerRow()],
    }, /auth user id must be a string/);
  });

  await t.test("malformed password iterations", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-bad-password", "bad-password@example.com", {
        password: {
          salt: TEST_PASSWORD_SALT,
          hash: TEST_PASSWORD_HASH,
          iterations: "not-a-number",
        },
      })],
      auth_store_meta: [canonicalMarkerRow()],
    }, /password iterations must be a finite positive integer/);
  });

  await t.test("missing password iterations", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-missing-iterations", "missing-iterations@example.com", {
        password: { salt: TEST_PASSWORD_SALT, hash: TEST_PASSWORD_HASH },
      })],
      auth_store_meta: [canonicalMarkerRow()],
    }, /password iterations must be a primitive positive integer/);
  });

  await t.test("array password material cannot stringify into credentials", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-array-password", "array-password@example.com", {
        password: { salt: [TEST_PASSWORD_SALT], hash: TEST_PASSWORD_HASH, iterations: 120000 },
      })],
      auth_store_meta: [canonicalMarkerRow()],
    }, /password salt must be a string/);
  });

  await t.test("password iterations above the CPU safety ceiling", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-high-iterations", "high-iterations@example.com", {
        password: {
          salt: TEST_PASSWORD_SALT,
          hash: TEST_PASSWORD_HASH,
          iterations: 2_000_001,
        },
      })],
      auth_store_meta: [canonicalMarkerRow()],
    }, /password iterations must be at most 2000000/);
  });

  await t.test("password hash with a silently truncated hexadecimal suffix", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-long-hash", "long-hash@example.com", {
        password: {
          salt: TEST_PASSWORD_SALT,
          hash: `${TEST_PASSWORD_HASH}f`,
          iterations: 120000,
        },
      })],
      auth_store_meta: [canonicalMarkerRow()],
    }, /password hash must be a 64-character hexadecimal digest/);
  });

  await t.test("oversized password salt", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-long-salt", "long-salt@example.com", {
        password: {
          salt: "s".repeat(513),
          hash: TEST_PASSWORD_HASH,
          iterations: 120000,
        },
      })],
      auth_store_meta: [canonicalMarkerRow()],
    }, /password salt must be at most 512 characters/);
  });

  await t.test("contradictory email verification metadata", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-verification-conflict", "verification-conflict@example.com", {
        emailVerified: false,
        emailVerifiedAt: 1_900_000_000_000,
      })],
      auth_store_meta: [canonicalMarkerRow()],
    }, /contradictory email verification metadata/);
  });

  await t.test("incomplete email verification metadata", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-verification-incomplete", "verification-incomplete@example.com", {
        emailVerified: true,
      })],
      auth_store_meta: [canonicalMarkerRow()],
    }, /must provide emailVerified and emailVerifiedAt together/);
  });

  await t.test("user without any authentication credential", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-no-credential", "no-credential@example.com", {
        password: null,
      })],
      auth_store_meta: [canonicalMarkerRow()],
    }, /has no usable authentication credential/);
  });

  await t.test("duplicate normalized email", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [
        adapterPasswordUser("user-email-a", "Writer@Example.com"),
        adapterPasswordUser("user-email-b", " writer@example.COM "),
      ],
      auth_store_meta: [canonicalMarkerRow()],
    }, /duplicate normalized auth email writer@example\.com/);
  });

  await t.test("duplicate normalized Apple subject", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [
        adapterPasswordUser("user-apple-a", "apple-a@example.com", {
          authProvider: "apple",
          appleSubject: "opaque-apple-subject",
          password: null,
        }),
        adapterPasswordUser("user-apple-b", "apple-b@example.com", {
          authProvider: "apple",
          appleSubject: "  opaque-apple-subject  ",
          password: null,
        }),
      ],
      auth_store_meta: [canonicalMarkerRow()],
    }, /duplicate Apple subject opaque-apple-subject/);
  });

  await t.test("object Apple subject cannot stringify into an identity", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-object-apple", "object-apple@example.com", {
        appleSubject: { value: "opaque-apple-subject" },
      })],
      auth_store_meta: [canonicalMarkerRow()],
    }, /appleSubject must be a string/);
  });

  await t.test("orphan session reference", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-present", "present@example.com")],
      auth_sessions: [{
        key: "session-orphan",
        value: {
          sessionId: "session-orphan",
          familyId: "family-orphan",
          userId: "user-missing",
          tokenHash: "token-orphan",
          expiresAt: 8_000_000_000_000,
          revokedAt: 0,
        },
      }],
      auth_store_meta: [canonicalMarkerRow()],
    }, /references unknown user user-missing/);
  });

  await t.test("duplicate token alias across auth domains", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-token", "token@example.com")],
      auth_sessions: [{
        key: "session-token",
        value: {
          sessionId: "session-token",
          familyId: "family-token",
          userId: "user-token",
          tokenHash: "shared-token-alias",
          expiresAt: 8_000_000_000_000,
          revokedAt: 0,
        },
      }],
      auth_password_reset_tokens: [{
        key: "shared-token-alias",
        value: {
          tokenHash: "shared-token-alias",
          userId: "user-token",
          expiresAt: 8_000_000_000_000,
          usedAt: 0,
        },
      }],
      auth_store_meta: [canonicalMarkerRow()],
    }, /duplicate auth token alias shared-token-alias/);
  });

  await t.test("missing session expiry cannot become a non-expiring session", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-expiry", "expiry@example.com")],
      auth_sessions: [{
        key: "session-no-expiry",
        value: {
          sessionId: "session-no-expiry",
          familyId: "family-no-expiry",
          userId: "user-expiry",
          tokenHash: "token-no-expiry",
          revokedAt: 0,
        },
      }],
      auth_store_meta: [canonicalMarkerRow()],
    }, /missing expiresAt/);
  });

  await t.test("array session expiry cannot coerce into a timestamp", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-array-expiry", "array-expiry@example.com")],
      auth_sessions: [{
        key: "session-array-expiry",
        value: {
          sessionId: "session-array-expiry",
          familyId: "family-array-expiry",
          userId: "user-array-expiry",
          tokenHash: "token-array-expiry",
          expiresAt: [8_000_000_000_000],
          revokedAt: 0,
        },
      }],
      auth_store_meta: [canonicalMarkerRow()],
    }, /expiresAt must be a primitive timestamp/);
  });

  await t.test("missing session revocation state cannot default active", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-no-revocation", "no-revocation@example.com")],
      auth_sessions: [{
        key: "session-no-revocation",
        value: {
          sessionId: "session-no-revocation",
          familyId: "family-no-revocation",
          userId: "user-no-revocation",
          tokenHash: "token-no-revocation",
          expiresAt: 8_000_000_000_000,
        },
      }],
      auth_store_meta: [canonicalMarkerRow()],
    }, /missing revokedAt/);
  });

  await t.test("missing one-time-token consumed state cannot default unused", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-no-used-at", "no-used-at@example.com")],
      auth_password_reset_tokens: [{
        key: "reset-no-used-at",
        value: {
          tokenHash: "reset-no-used-at",
          userId: "user-no-used-at",
          expiresAt: 8_000_000_000_000,
        },
      }],
      auth_store_meta: [canonicalMarkerRow()],
    }, /missing usedAt/);
  });

  await t.test("object one-time-token state cannot coerce into unused", async () => {
    await assertInvalidCanonicalHydrationPreservesLiveState({
      auth_users: [adapterPasswordUser("user-object-used-at", "object-used-at@example.com")],
      auth_email_verification_tokens: [{
        key: "verify-object-used-at",
        value: {
          tokenHash: "verify-object-used-at",
          userId: "user-object-used-at",
          expiresAt: 8_000_000_000_000,
          usedAt: { value: 0 },
        },
      }],
      auth_store_meta: [canonicalMarkerRow()],
    }, /usedAt must be a primitive timestamp/);
  });
});

test("[user-store-persistence] canonical hydration preserves supported flat legacy password records", async () => {
  const persistence = createPaginatedMemoryPersistence({
    auth_users: [{
      key: "user-legacy-password",
      value: {
        id: "user-legacy-password",
        email: "legacy-password@example.com",
        passwordSalt: TEST_PASSWORD_SALT,
        passwordHash: TEST_PASSWORD_HASH,
        passwordIterations: "120000",
      },
    }],
    auth_store_meta: [canonicalMarkerRow()],
  });
  configureTestStore(persistence);

  assert.equal(await loadUserStoreFromAdapter(), true);
  assert.deepEqual(getUserByEmail("legacy-password@example.com")?.password, {
    salt: TEST_PASSWORD_SALT,
    hash: TEST_PASSWORD_HASH,
    iterations: 120000,
  });
});

test("[user-store-persistence] canonical hydration rejects non-string adapter row keys", async () => {
  const user = adapterPasswordUser("user-array-row-key", "array-row-key@example.com");
  configureTestStore({
    kind: "raw-row-key-test",
    async list({ domain }) {
      if (domain === "auth_users") return [{ ...user, key: [user.key] }];
      if (domain === "auth_store_meta") return [canonicalMarkerRow()];
      return [];
    },
  });
  const sentinel = seedLiveAuthSentinel();

  await assert.rejects(
    loadUserStoreFromAdapter(),
    (error) => {
      assert.equal(error?.code, "USER_STORE_ADAPTER_INVALID");
      assert.match(String(error?.message || ""), /returned a row without a key/);
      return true;
    },
  );
  assert.equal(usersById.get(sentinel.user.id), sentinel.user);
  assert.equal(authSessionsById.get(sentinel.session.sessionId), sentinel.session);
});

test("[user-store-persistence] adapter hydration loads auth sessions beyond the 10k page cap", async () => {
  const sessionRows = Array.from({ length: 10_001 }, (_, index) => {
    const suffix = String(index).padStart(5, "0");
    return {
      key: `session-${suffix}`,
      value: {
        sessionId: `session-${suffix}`,
        familyId: `family-${suffix}`,
        userId: "user-paginated",
        tokenHash: `token-hash-${suffix}`,
        createdAt: 1_000,
        updatedAt: 1_000,
        expiresAt: 8_000_000_000_000,
        revokedAt: 0,
        replacedBySessionId: "",
      },
    };
  });
  const persistence = createPaginatedMemoryPersistence({
    auth_users: [{
      key: "user-paginated",
      value: {
        id: "user-paginated",
        email: "paginated@example.com",
        authProvider: "password",
        password: {
          salt: TEST_PASSWORD_SALT,
          hash: TEST_PASSWORD_HASH,
          iterations: 120000,
        },
        createdAt: 1_000,
        updatedAt: 1_000,
      },
    }],
    auth_sessions: sessionRows,
    auth_store_meta: [{
      key: "canonical_state",
      value: { schemaVersion: 1, initialized: true },
    }],
  });

  configureTestStore(persistence);
  assert.equal(await loadUserStoreFromAdapter(), true);
  assert.equal(authSessionsById.has("session-10000"), true);
  assert.deepEqual(
    persistence.listCalls
      .filter((call) => call.domain === "auth_sessions")
      .map((call) => call.afterKey),
    ["", "session-09999"],
  );
});

test("[user-store-persistence] snapshot pruning deletes stale auth rows beyond the 10k page cap", async () => {
  const staleSessionRows = Array.from({ length: 10_001 }, (_, index) => {
    const key = `stale-session-${String(index).padStart(5, "0")}`;
    return { key, value: { sessionId: key } };
  });
  const persistence = createPaginatedMemoryPersistence({
    auth_sessions: staleSessionRows,
  });

  configureTestStore(persistence);
  saveUserStore(1_000);
  const flushed = await flushUserStorePersistenceWrites();

  assert.equal(flushed.ok, true);
  assert.deepEqual(persistence.keys("auth_sessions"), []);
  assert.deepEqual(
    persistence.listCalls
      .filter((call) => call.domain === "auth_sessions")
      .map((call) => call.afterKey),
    ["", "stale-session-09999"],
  );
});

test("[user-store-persistence] auth pagination rejects a nonadvancing adapter page", async () => {
  const repeatedPage = Array.from({ length: 10_000 }, (_, index) => ({
    key: `user-${String(index).padStart(5, "0")}`,
    value: null,
  }));
  configureTestStore({
    kind: "nonadvancing-test",
    async put() {},
    async list({ domain }) {
      return domain === "auth_users" ? repeatedPage : [];
    },
  });

  await assert.rejects(
    loadUserStoreFromAdapter({ failOnUnavailable: true }),
    (error) => {
      assert.equal(error?.code, "USER_STORE_ADAPTER_INVALID");
      assert.match(String(error?.message || ""), /pagination did not advance/);
      return true;
    },
  );
});

test("[user-store-persistence] file-only save failures are visible through the flush boundary", async () => {
  clearUserStoreMaps();
  configureUserStore({
    USER_STORE_PATH: tempPath("io-them-auth-file-failure-", "user_store.json"),
    fs,
    normalizeSnippet: (value, max = 160) => String(value || "").trim().slice(0, max),
    persistence: null,
    writeJsonFileAtomic: () => false,
  });

  const created = createUser({ email: "file-failure@example.com", password: "longenough" });
  assert.equal(created.ok, true);
  const flushed = await flushUserStorePersistenceWrites();
  assert.equal(flushed.ok, false);
  assert.equal(flushed.fileOk, false);
  assert.equal(flushed.persistenceStatus, "not_configured");
});

test("[user-store-persistence] consuming an expired token durably removes it", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPath("io-them-auth-expired-token-") });
  try {
    configureTestStore(persistence);
    const created = createUser({ email: "expired-token@example.com", password: "longenough" }, 1_000);
    const issued = issuePasswordResetToken({ userId: created.user.id, ttlMs: 60_000 }, 1_000);
    await flushUserStorePersistenceWrites();
    assert.equal(
      (await persistence.list({ domain: "auth_password_reset_tokens", limit: 100 })).length,
      1,
    );

    assert.equal(consumePasswordResetToken(issued.token, 61_001), null);
    const flushed = await flushUserStorePersistenceWrites();
    assert.equal(flushed.ok, true);
    assert.equal(
      (await persistence.list({ domain: "auth_password_reset_tokens", limit: 100 })).length,
      0,
    );
  } finally {
    await persistence.close();
  }
});

test("[user-store-persistence] empty adapter lets startup fall back to legacy file", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPath("io-them-auth-empty-persistence-") });
  try {
    configureTestStore(persistence);
    assert.equal(await loadUserStoreFromAdapter(), false);
  } finally {
    await persistence.close();
  }
});

test("[user-store-persistence] initialized empty adapter is authoritative over stale local state", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPath("io-them-auth-canonical-empty-") });
  const userStorePath = tempPath("io-them-auth-stale-local-", "user_store.json");
  try {
    configureTestStore(persistence, userStorePath);
    saveUserStore(1_000);
    const flushed = await flushUserStorePersistenceWrites();
    assert.equal(flushed.ok, true);
    assert.deepEqual(
      await persistence.get({ domain: "auth_store_meta", key: "canonical_state" }),
      { schemaVersion: 1, initialized: true },
      "even an empty canonical store records that its state has been initialized",
    );

    fs.writeFileSync(userStorePath, JSON.stringify({
      users: [{
        id: "user_stale_local",
        email: "stale-local@example.com",
        name: "Stale Local",
        authProvider: "password",
        appleSubject: "",
        emailVerified: false,
        createdAt: 1_000,
        updatedAt: 1_000,
      }],
      authSessions: [],
      passwordResetTokens: [],
      emailVerificationTokens: [],
    }), "utf8");
    loadUserStore();
    assert.equal(getUserByEmail("stale-local@example.com")?.id, "user_stale_local");

    assert.equal(
      await loadUserStoreFromAdapter(),
      true,
      "the marker makes a reachable empty adapter authoritative instead of migration-eligible",
    );
    assert.equal(getUserByEmail("stale-local@example.com"), null);
    assert.equal(usersById.size, 0);
  } finally {
    await persistence.close();
  }
});

test("[user-store-persistence] migration marker protects a pre-marker empty canonical store on first upgraded boot", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPath("io-them-auth-upgrade-empty-") });
  const userStorePath = tempPath("io-them-auth-upgrade-stale-local-", "user_store.json");
  try {
    await persistence.put({
      domain: "auth_store_meta",
      key: "canonical_state",
      value: { schemaVersion: 1, initialized: true },
    });
    configureTestStore(persistence, userStorePath);
    fs.writeFileSync(userStorePath, JSON.stringify({
      users: [{
        id: "user_stale_upgrade",
        email: "stale-upgrade@example.com",
        authProvider: "password",
        appleSubject: "",
        emailVerified: false,
        createdAt: 1_000,
        updatedAt: 1_000,
      }],
      authSessions: [],
      passwordResetTokens: [],
      emailVerificationTokens: [],
    }), "utf8");
    loadUserStore();
    assert.equal(getUserByEmail("stale-upgrade@example.com")?.id, "user_stale_upgrade");

    assert.equal(await loadUserStoreFromAdapter(), true);
    assert.equal(getUserByEmail("stale-upgrade@example.com"), null);
    assert.equal(usersById.size, 0);
  } finally {
    await persistence.close();
  }
});

test("[user-store-persistence] durable session revocation restores live and canonical state after a write failure", async () => {
  const basePersistence = createJsonPersistence({ jsonRoot: tempPath("io-them-auth-revoke-rollback-") });
  const persistence = withOneShotPutFailure(basePersistence);
  try {
    configureTestStore(persistence);
    const now = Date.now();
    const created = createUser({
      email: "revocation-rollback@example.com",
      password: "longenough",
    }, now);
    assert.equal(created.ok, true);
    const issued = issueAuthSession({ userId: created.user.id, ttlMs: 300_000 }, now);
    assert.ok(issued.refreshToken);
    assert.equal((await flushUserStorePersistenceWrites()).ok, true);

    persistence.failNextPutWhen(({ domain, key, value }) => (
      domain === "auth_sessions"
      && key === issued.session.sessionId
      && Number(value?.revokedAt || 0) > 0
    ));
    const result = await revokeAllAuthSessionsForUserDurably(created.user.id, now + 1_000);
    assert.deepEqual(
      { ok: result.ok, retryable: result.retryable },
      { ok: false, retryable: true },
    );

    const restoredLiveSession = getAuthSessionByToken(issued.refreshToken, now + 2_000);
    assert.equal(restoredLiveSession?.sessionId, issued.session.sessionId);
    assert.equal(restoredLiveSession?.revokedAt, 0);

    clearUserStoreMaps();
    assert.equal(await loadUserStoreFromAdapter(), true);
    const restoredCanonicalSession = getAuthSessionByToken(issued.refreshToken, now + 2_000);
    assert.equal(restoredCanonicalSession?.sessionId, issued.session.sessionId);
    assert.equal(restoredCanonicalSession?.revokedAt, 0);
  } finally {
    await basePersistence.close();
  }
});

test("[user-store-persistence] strict startup distinguishes unavailable and uninitialized adapters", async () => {
  configureTestStore({
    kind: "unavailable-test",
    async put() {},
    async list() {
      throw new Error("simulated canonical database outage");
    },
  });

  await assert.rejects(
    loadUserStoreFromAdapter({ failOnUnavailable: true }),
    (error) => {
      assert.equal(error?.code, "USER_STORE_ADAPTER_UNAVAILABLE");
      assert.equal(error?.message, "user_store_adapter_unavailable");
      assert.match(String(error?.cause?.message || ""), /canonical database outage/);
      return true;
    },
  );

  assert.equal(
    await loadUserStoreFromAdapter(),
    false,
    "non-production migration mode may still use the legacy-file fallback",
  );

  const emptyPersistence = createJsonPersistence({ jsonRoot: tempPath("io-them-auth-strict-empty-") });
  try {
    configureTestStore(emptyPersistence);
    await assert.rejects(
      loadUserStoreFromAdapter({
        failOnUnavailable: true,
        failOnUninitialized: true,
      }),
      (error) => {
        assert.equal(error?.code, "USER_STORE_ADAPTER_UNINITIALIZED");
        assert.equal(error?.message, "user_store_adapter_uninitialized");
        return true;
      },
    );
    assert.equal(
      await loadUserStoreFromAdapter({ failOnUnavailable: true }),
      false,
      "non-production migration mode may opt into one-time legacy backfill",
    );
  } finally {
    await emptyPersistence.close();
  }
});

test("[user-store-persistence] strict startup rejects an adapter without canonical reads", async () => {
  configureTestStore({
    kind: "write-only-test",
    async put() {},
  });

  await assert.rejects(
    loadUserStoreFromAdapter({ failOnUnavailable: true }),
    (error) => error?.code === "USER_STORE_ADAPTER_UNAVAILABLE",
  );
});

test("[user-store-persistence] startup backfills existing legacy accounts into the adapter", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPath("io-them-auth-backfill-persistence-") });
  const userStorePath = tempPath("io-them-auth-backfill-store-", "user_store.json");
  fs.mkdirSync(path.dirname(userStorePath), { recursive: true });
  fs.writeFileSync(userStorePath, JSON.stringify({
    users: [{
      id: "user_legacy_writer",
      email: "Legacy.Writer@Example.com",
      name: "Legacy Writer",
      authProvider: "apple",
      appleSubject: "apple-legacy-writer",
      emailVerified: true,
      createdAt: 1_000,
      updatedAt: 2_000,
    }],
    authSessions: [],
    passwordResetTokens: [],
    emailVerificationTokens: [],
  }), "utf8");

  try {
    configureTestStore(persistence, userStorePath);
    assert.equal(await loadUserStoreFromAdapter(), false);

    loadUserStore();
    assert.equal(getUserByEmail("legacy.writer@example.com")?.id, "user_legacy_writer");
    const backfill = saveUserStore(3_000);
    assert.ok(backfill.persistencePromise);
    const flushed = await flushUserStorePersistenceWrites();
    assert.equal(flushed.ok, true);

    clearUserStoreMaps();
    assert.equal(await loadUserStoreFromAdapter(), true);
    assert.equal(getUserByEmail("legacy.writer@example.com")?.id, "user_legacy_writer");
    assert.equal(
      usersByAppleSubject.get("apple-legacy-writer")?.id,
      "user_legacy_writer"
    );
  } finally {
    await persistence.close();
  }
});

test("[user-store-persistence] rejects duplicate Apple subjects before persistence", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPath("io-them-auth-apple-unique-") });
  try {
    configureTestStore(persistence);
    const first = createUser({
      email: "first@example.com",
      password: "longenough",
      appleSubject: "apple-shared-subject",
    });
    assert.equal(first.ok, true);

    const duplicate = createUser({
      email: "second@example.com",
      password: "longenough",
      appleSubject: "apple-shared-subject",
    });
    assert.deepEqual(
      { ok: duplicate.ok, status: duplicate.status },
      { ok: false, status: "apple_subject_taken" }
    );
    await flushUserStorePersistenceWrites();
  } finally {
    await persistence.close();
  }
});

test("[auth-identity-migration] enforces normalized email and Apple subject uniqueness", () => {
  const sql = fs.readFileSync(
    new URL("../migrations/010_auth_identity_uniqueness.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS persistence_auth_users_email_unique_idx/);
  assert.match(sql, /LOWER\(BTRIM\(value->>'email'\)\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS persistence_auth_users_apple_subject_unique_idx/);
  assert.match(sql, /BTRIM\(value->>'appleSubject'\)/);
});

test("[auth-store-metadata-migration] marks only nonempty auth stores during upgrade", () => {
  const sql = fs.readFileSync(
    new URL("../migrations/011_auth_store_metadata.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS persistence_auth_store_meta/);
  assert.match(sql, /INSERT INTO persistence_auth_store_meta/);
  assert.match(sql, /WHERE EXISTS/);
  assert.match(sql, /SELECT 1 FROM persistence_auth_users/);
  assert.match(sql, /ON CONFLICT \(key\) DO NOTHING/);
  assert.doesNotMatch(sql, /VALUES\s*\(\s*'canonical_state'/);
});

test("[auth-user-scoped-index-migration] indexes the user-scoped auth lookups used by canonical mutations", () => {
  const sql = fs.readFileSync(
    new URL("../migrations/012_auth_user_scoped_indexes.sql", import.meta.url),
    "utf8"
  );
  // completePasswordReset and revokeAuthSessionsForUser select by value->>'userId'
  // under FOR UPDATE; both tables need the matching expression index.
  assert.match(sql, /CREATE INDEX IF NOT EXISTS persistence_auth_sessions_user_id_idx\s+ON persistence_auth_sessions \(\(value->>'userId'\)\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS persistence_auth_password_reset_tokens_user_id_idx\s+ON persistence_auth_password_reset_tokens \(\(value->>'userId'\)\)/);
  assert.doesNotMatch(sql, /CONCURRENTLY/);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});
