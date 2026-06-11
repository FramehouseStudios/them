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
  createUser,
  emailVerificationTokensByHash,
  flushUserStorePersistenceWrites,
  getAuthSessionByToken,
  getUserByEmail,
  issueAuthSession,
  loadUserStoreFromAdapter,
  passwordResetTokensByHash,
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

function configureTestStore(persistence) {
  clearUserStoreMaps();
  configureUserStore({
    USER_STORE_PATH: tempPath("io-them-auth-store-", "user_store.json"),
    fs,
    normalizeSnippet: (value, max = 160) => String(value || "").trim().slice(0, max),
    persistence,
    writeJsonFileAtomic: (filePath, payload) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      return true;
    },
  });
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

test("[user-store-persistence] empty adapter lets startup fall back to legacy file", async () => {
  const persistence = createJsonPersistence({ jsonRoot: tempPath("io-them-auth-empty-persistence-") });
  try {
    configureTestStore(persistence);
    assert.equal(await loadUserStoreFromAdapter(), false);
  } finally {
    await persistence.close();
  }
});
