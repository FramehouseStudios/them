import assert from "node:assert/strict";
import { test } from "node:test";

import { createPostgresPersistence } from "../lib/persistence_postgres.js";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();

test("[postgres-live] prefix metacharacters are literal in a real Postgres query", {
  skip: databaseUrl ? false : "DATABASE_URL is not configured",
}, async () => {
  const persistence = createPostgresPersistence({ databaseUrl });
  const runId = `${process.pid}-${Date.now()}`;
  const prefix = `like-audit-${runId}%_\\folder`;
  const exactKeys = [`${prefix}:alpha`, `${prefix}:beta`];
  const wildcardOnlyKey = `like-audit-${runId}-anythingXfolder:wrong`;
  const keys = [...exactKeys, wildcardOnlyKey];

  try {
    for (const key of keys) {
      await persistence.put({ domain: "screenplay", key, value: { key } });
    }

    const records = await persistence.list({ domain: "screenplay", prefix });
    assert.deepEqual(records.map((record) => record.key), exactKeys);
  } finally {
    for (const key of keys) {
      await persistence.delete({ domain: "screenplay", key });
    }
    await persistence.close();
  }
});

test("[postgres-live] concurrent email-login issuance commits one conflicting session ID", {
  skip: databaseUrl ? false : "DATABASE_URL is not configured",
}, async () => {
  const left = createPostgresPersistence({ databaseUrl });
  const right = createPostgresPersistence({ databaseUrl });
  const runId = `${process.pid}-${Date.now()}-login`;
  const user = {
    id: `live-login-${runId}-writer`,
    email: `live-login-${runId}@example.com`,
  };
  const session = {
    sessionId: `live-login-${runId}-session`,
    familyId: `live-login-${runId}-family`,
    userId: user.id,
    tokenHash: `live-login-${runId}-hash`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    revokedAt: 0,
    replacedBySessionId: "",
    metadata: {},
  };

  try {
    await left.put({ domain: "auth_users", key: user.id, value: user });
    const outcomes = await Promise.all([
      left.issueAuthSession({ userId: user.id, expectedUser: user, session }),
      right.issueAuthSession({ userId: user.id, expectedUser: user, session }),
    ]);
    assert.deepEqual(
      outcomes.map((outcome) => outcome.status).sort(),
      ["committed", "conflict"],
    );
    assert.deepEqual(
      await left.get({ domain: "auth_sessions", key: session.sessionId }),
      session,
    );
  } finally {
    await left.delete({ domain: "auth_sessions", key: session.sessionId });
    await left.delete({ domain: "auth_users", key: user.id });
    await Promise.all([left.close(), right.close()]);
  }
});

test("[postgres-live] concurrent password reset and stale login leave no active old-password session", {
  skip: databaseUrl ? false : "DATABASE_URL is not configured",
}, async () => {
  const resetPersistence = createPostgresPersistence({ databaseUrl });
  const loginPersistence = createPostgresPersistence({ databaseUrl });
  const runId = `${process.pid}-${Date.now()}-password-reset`;
  const expectedUser = {
    id: `live-reset-${runId}-writer`,
    email: `live-reset-${runId}@example.com`,
    name: "",
    authProvider: "password",
    appleSubject: "",
    emailVerified: true,
    emailVerifiedAt: Date.now() - 2,
    password: { salt: "old-salt", iterations: 600_000, hash: "old-hash" },
    createdAt: Date.now() - 2,
    updatedAt: Date.now() - 1,
  };
  const completedAt = Date.now();
  const updatedUser = {
    ...expectedUser,
    password: { salt: "new-salt", iterations: 600_000, hash: "new-hash" },
    updatedAt: completedAt,
  };
  const expectedToken = {
    tokenHash: `live-reset-${runId}-token`,
    userId: expectedUser.id,
    createdAt: completedAt - 1,
    expiresAt: completedAt + 60_000,
    usedAt: 0,
  };
  const consumedToken = { ...expectedToken, usedAt: completedAt };
  const siblingToken = {
    ...expectedToken,
    tokenHash: `live-reset-${runId}-sibling-token`,
  };
  const unrelatedToken = {
    ...expectedToken,
    tokenHash: `live-reset-${runId}-unrelated-token`,
    userId: `live-reset-${runId}-other-writer`,
  };
  const loginSession = {
    sessionId: `live-reset-${runId}-login`,
    familyId: `live-reset-${runId}-family`,
    userId: expectedUser.id,
    tokenHash: `live-reset-${runId}-session-hash`,
    createdAt: completedAt,
    updatedAt: completedAt,
    expiresAt: completedAt + 60_000,
    revokedAt: 0,
    replacedBySessionId: "",
    metadata: {},
  };

  try {
    await resetPersistence.put({ domain: "auth_users", key: expectedUser.id, value: expectedUser });
    await resetPersistence.put({
      domain: "auth_password_reset_tokens",
      key: expectedToken.tokenHash,
      value: expectedToken,
    });
    await resetPersistence.put({
      domain: "auth_password_reset_tokens",
      key: siblingToken.tokenHash,
      value: siblingToken,
    });
    await resetPersistence.put({
      domain: "auth_password_reset_tokens",
      key: unrelatedToken.tokenHash,
      value: unrelatedToken,
    });
    const [reset, issuance] = await Promise.all([
      resetPersistence.completePasswordReset({
        expectedUser,
        updatedUser,
        expectedToken,
        consumedToken,
      }),
      loginPersistence.issueAuthSession({
        userId: expectedUser.id,
        expectedUser,
        session: loginSession,
      }),
    ]);
    assert.equal(reset.status, "committed");
    assert.ok(["committed", "user_missing"].includes(issuance.status));
    const storedSession = await resetPersistence.get({
      domain: "auth_sessions",
      key: loginSession.sessionId,
    });
    if (issuance.status === "committed") {
      assert.equal(Number(storedSession?.revokedAt || 0) > 0, true);
    } else {
      assert.equal(storedSession, null);
    }
    assert.equal(Number((await resetPersistence.get({
      domain: "auth_password_reset_tokens",
      key: siblingToken.tokenHash,
    }))?.usedAt || 0), completedAt);
    assert.deepEqual(await resetPersistence.get({
      domain: "auth_password_reset_tokens",
      key: unrelatedToken.tokenHash,
    }), unrelatedToken);
  } finally {
    await resetPersistence.delete({ domain: "auth_sessions", key: loginSession.sessionId });
    await resetPersistence.delete({
      domain: "auth_password_reset_tokens",
      key: expectedToken.tokenHash,
    });
    await resetPersistence.delete({
      domain: "auth_password_reset_tokens",
      key: siblingToken.tokenHash,
    });
    await resetPersistence.delete({
      domain: "auth_password_reset_tokens",
      key: unrelatedToken.tokenHash,
    });
    await resetPersistence.delete({ domain: "auth_users", key: expectedUser.id });
    await Promise.all([resetPersistence.close(), loginPersistence.close()]);
  }
});

test("[postgres-live] concurrent reset-token issuance and completion serialize safely", {
  skip: databaseUrl ? false : "DATABASE_URL is not configured",
}, async () => {
  const resetPersistence = createPostgresPersistence({ databaseUrl });
  const requestPersistence = createPostgresPersistence({ databaseUrl });
  const runId = `${process.pid}-${Date.now()}-reset-request`;
  const completedAt = Date.now();
  const expectedUser = {
    id: `live-reset-request-${runId}-writer`,
    email: `live-reset-request-${runId}@example.com`,
    name: "",
    authProvider: "password",
    appleSubject: "",
    emailVerified: true,
    emailVerifiedAt: completedAt - 2,
    password: { salt: "old-salt", iterations: 600_000, hash: "old-hash" },
    createdAt: completedAt - 2,
    updatedAt: completedAt - 1,
  };
  const updatedUser = {
    ...expectedUser,
    password: { salt: "new-salt", iterations: 600_000, hash: "new-hash" },
    updatedAt: completedAt,
  };
  const completionToken = {
    tokenHash: `live-reset-request-${runId}-completion`,
    userId: expectedUser.id,
    createdAt: completedAt - 1,
    expiresAt: completedAt + 60_000,
    usedAt: 0,
  };
  const consumedToken = { ...completionToken, usedAt: completedAt };
  const issuedToken = {
    ...completionToken,
    tokenHash: `live-reset-request-${runId}-concurrent`,
  };

  try {
    await resetPersistence.put({ domain: "auth_users", key: expectedUser.id, value: expectedUser });
    await resetPersistence.put({
      domain: "auth_password_reset_tokens",
      key: completionToken.tokenHash,
      value: completionToken,
    });
    const [completion, issuance] = await Promise.all([
      resetPersistence.completePasswordReset({
        expectedUser,
        updatedUser,
        expectedToken: completionToken,
        consumedToken,
      }),
      requestPersistence.issuePasswordResetToken({
        userId: expectedUser.id,
        expectedUser,
        token: issuedToken,
      }),
    ]);
    assert.equal(completion.status, "committed");
    assert.ok(["committed", "user_missing"].includes(issuance.status));
    const storedIssued = await resetPersistence.get({
      domain: "auth_password_reset_tokens",
      key: issuedToken.tokenHash,
    });
    if (issuance.status === "committed") {
      assert.equal(Number(storedIssued?.usedAt || 0), completedAt);
    } else {
      assert.equal(storedIssued, null);
    }
  } finally {
    for (const tokenHash of [completionToken.tokenHash, issuedToken.tokenHash]) {
      await resetPersistence.delete({
        domain: "auth_password_reset_tokens",
        key: tokenHash,
      });
    }
    await resetPersistence.delete({ domain: "auth_users", key: expectedUser.id });
    await Promise.all([resetPersistence.close(), requestPersistence.close()]);
  }
});

test("[postgres-live] concurrent refresh rotation commits exactly one replacement", {
  skip: databaseUrl ? false : "DATABASE_URL is not configured",
}, async () => {
  const left = createPostgresPersistence({ databaseUrl });
  const right = createPostgresPersistence({ databaseUrl });
  const runId = `${process.pid}-${Date.now()}`;
  const current = {
    sessionId: `live-refresh-${runId}-current`,
    familyId: `live-refresh-${runId}-family`,
    userId: `live-refresh-${runId}-writer`,
    tokenHash: `live-refresh-${runId}-hash`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    revokedAt: 0,
    replacedBySessionId: "",
    metadata: {},
  };
  const nextSessions = ["left", "right"].map((side) => ({
    ...current,
    sessionId: `live-refresh-${runId}-${side}`,
    tokenHash: `live-refresh-${runId}-${side}-hash`,
    createdAt: current.createdAt + 1,
    updatedAt: current.updatedAt + 1,
  }));
  const previousSessions = nextSessions.map((nextSession, index) => ({
    ...current,
    updatedAt: current.updatedAt + index + 1,
    revokedAt: current.updatedAt + index + 1,
    replacedBySessionId: nextSession.sessionId,
  }));
  const keys = [current.sessionId, ...nextSessions.map((session) => session.sessionId)];

  try {
    await left.put({ domain: "auth_sessions", key: current.sessionId, value: current });
    const outcomes = await Promise.all([
      left.rotateAuthSession({
        expectedSession: current,
        previousSession: previousSessions[0],
        nextSession: nextSessions[0],
      }),
      right.rotateAuthSession({
        expectedSession: current,
        previousSession: previousSessions[1],
        nextSession: nextSessions[1],
      }),
    ]);
    assert.equal(outcomes.filter(Boolean).length, 1);
    const storedPrevious = await left.get({
      domain: "auth_sessions",
      key: current.sessionId,
    });
    const winnerIndex = storedPrevious.replacedBySessionId === nextSessions[0].sessionId ? 0 : 1;
    assert.deepEqual(
      await left.get({ domain: "auth_sessions", key: nextSessions[winnerIndex].sessionId }),
      nextSessions[winnerIndex],
    );
    assert.equal(
      await left.get({ domain: "auth_sessions", key: nextSessions[1 - winnerIndex].sessionId }),
      null,
    );
  } finally {
    for (const key of keys) {
      await left.delete({ domain: "auth_sessions", key });
    }
    await Promise.all([left.close(), right.close()]);
  }
});

test("[postgres-live] concurrent refresh and user revocation serialize without an active survivor", {
  skip: databaseUrl ? false : "DATABASE_URL is not configured",
}, async () => {
  const refreshPersistence = createPostgresPersistence({ databaseUrl });
  const revokePersistence = createPostgresPersistence({ databaseUrl });
  const runId = `${process.pid}-${Date.now()}-revoke`;
  const current = {
    sessionId: `live-refresh-revoke-${runId}-current`,
    familyId: `live-refresh-revoke-${runId}-family`,
    userId: `live-refresh-revoke-${runId}-writer`,
    tokenHash: `live-refresh-revoke-${runId}-hash`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    revokedAt: 0,
    replacedBySessionId: "",
    metadata: {},
  };
  const replacement = {
    ...current,
    sessionId: `live-refresh-revoke-${runId}-replacement`,
    tokenHash: `live-refresh-revoke-${runId}-replacement-hash`,
    createdAt: current.createdAt + 1,
    updatedAt: current.updatedAt + 1,
  };
  const previous = {
    ...current,
    updatedAt: current.updatedAt + 1,
    revokedAt: current.updatedAt + 1,
    replacedBySessionId: replacement.sessionId,
  };
  const unrelated = {
    ...current,
    sessionId: `live-refresh-revoke-${runId}-unrelated`,
    familyId: `live-refresh-revoke-${runId}-unrelated-family`,
    userId: `live-refresh-revoke-${runId}-unrelated-writer`,
    tokenHash: `live-refresh-revoke-${runId}-unrelated-hash`,
  };
  const keys = [current.sessionId, replacement.sessionId, unrelated.sessionId];

  try {
    await refreshPersistence.put({ domain: "auth_sessions", key: current.sessionId, value: current });
    await refreshPersistence.put({ domain: "auth_sessions", key: unrelated.sessionId, value: unrelated });
    const [rotated, revoked] = await Promise.all([
      refreshPersistence.rotateAuthSession({
        expectedSession: current,
        previousSession: previous,
        nextSession: replacement,
      }),
      revokePersistence.revokeAuthSessionsForUser({
        userId: current.userId,
        revokedAt: current.updatedAt + 2,
      }),
    ]);
    assert.equal(revoked.status, "committed");
    assert.equal(Number((await refreshPersistence.get({
      domain: "auth_sessions",
      key: current.sessionId,
    }))?.revokedAt || 0) > 0, true);
    const storedReplacement = await refreshPersistence.get({
      domain: "auth_sessions",
      key: replacement.sessionId,
    });
    if (rotated) {
      assert.equal(Number(storedReplacement?.revokedAt || 0) > 0, true);
    } else {
      assert.equal(storedReplacement, null);
    }
    assert.deepEqual(
      await refreshPersistence.get({ domain: "auth_sessions", key: unrelated.sessionId }),
      unrelated,
    );
  } finally {
    for (const key of keys) {
      await refreshPersistence.delete({ domain: "auth_sessions", key });
    }
    await Promise.all([refreshPersistence.close(), revokePersistence.close()]);
  }
});
