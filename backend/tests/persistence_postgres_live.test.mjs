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
