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
  saveUserStore,
  usersByAppleSubject,
  usersByEmail,
  usersById,
} from "../lib/user_store.js";

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

test("[user-store-persistence] strict startup distinguishes an empty adapter from an unavailable adapter", async () => {
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
    assert.equal(
      await loadUserStoreFromAdapter({ failOnUnavailable: true }),
      false,
      "a reachable but empty adapter remains eligible for the one-time legacy backfill",
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
