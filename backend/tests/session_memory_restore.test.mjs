import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAccountMemoryCAS } from "../lib/account_memory_cas.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { restoreAuthenticatedSessionMemory } from "../lib/session_memory_restore.js";

function sanitize(value) {
  return structuredClone(value || {});
}

function buildThreads(memory) {
  return Array.isArray(memory?.turnHistory) ? memory.turnHistory : [];
}

function noBackfill() {
  return { applied: false, created: 0, trigger: "session_load", keys: [] };
}

function initializeSession(memory, nowTs) {
  memory.sessionStartedAt = nowTs;
  memory.checkInPromptsUsed = 0;
  return memory;
}

function createStores(prefix) {
  const jsonRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    writer: createAccountMemoryCAS({
      persistence: createJsonPersistence({ jsonRoot }),
      sanitizeMemory: sanitize,
    }),
    reader: createAccountMemoryCAS({
      persistence: createJsonPersistence({ jsonRoot }),
      sanitizeMemory: sanitize,
    }),
  };
}

test("session restore reads the newer account memory without rewriting it", async () => {
  const userId = "writer-session-read";
  const stores = createStores("io-them-session-read-");
  const initial = await stores.writer.read({
    userId,
    fallbackMemory: {
      lastUpdatedAt: 100,
      userPrimaryName: "June",
      turnHistory: [{ turn: 1, content: "Open in the archive.", ts: 100 }],
    },
  });
  await stores.writer.commit({
    userId,
    expectedRecord: initial.record,
    memory: initial.memory,
    now: 100,
  });
  const staleLocal = await stores.reader.read({ userId });
  const latestRead = await stores.writer.read({ userId });
  const latest = sanitize(latestRead.memory);
  latest.userPrimaryName = "June Across Devices";
  latest.turnHistory.push({ turn: 2, content: "Mara screens the reel.", ts: 120 });
  await stores.writer.commit({
    userId,
    expectedRecord: latestRead.record,
    memory: latest,
    now: 120,
  });

  const activeSession = { memory: staleLocal.memory };
  let writeCount = 0;
  const restored = await restoreAuthenticatedSessionMemory({
    req: {},
    token: "session-reader",
    activeSession,
    isNewSession: false,
    nowTs: 130,
    resolveCanonicalWritableMemoryContext: async () => {
      const canonical = await stores.reader.read({ userId });
      return {
        authenticatedUserId: userId,
        canonical: true,
        canonicalRecord: canonical.record,
        memory: canonical.memory,
      };
    },
    persistCanonicalWritableMemoryContext: async () => {
      writeCount += 1;
      throw new Error("existing restore must not write without a backfill");
    },
    sanitizeMemory: sanitize,
    initializeNewSessionMemory: initializeSession,
    buildConversationHistoryThreads: buildThreads,
    maybeBackfillThemesFromHistory: noBackfill,
  });

  assert.equal(writeCount, 0);
  assert.equal(restored.memory.userPrimaryName, "June Across Devices");
  assert.equal(restored.memory.turnHistory.at(-1).turn, 2);
  assert.equal(activeSession.memory.turnHistory.at(-1).turn, 2);
});

test("new session initialization rebases over a concurrent screenplay turn", async () => {
  const userId = "writer-session-race";
  const stores = createStores("io-them-session-race-");
  const initial = await stores.writer.read({
    userId,
    fallbackMemory: {
      lastUpdatedAt: 100,
      turnHistory: [{ turn: 1, content: "Mara enters.", ts: 100 }],
    },
  });
  await stores.writer.commit({
    userId,
    expectedRecord: initial.record,
    memory: initial.memory,
    now: 100,
  });

  const activeSession = { memory: {} };
  let persistCalls = 0;
  const restored = await restoreAuthenticatedSessionMemory({
    req: {},
    token: "session-race",
    activeSession,
    isNewSession: true,
    nowTs: 110,
    resolveCanonicalWritableMemoryContext: async () => {
      const canonical = await stores.reader.read({ userId });
      return {
        authenticatedUserId: userId,
        canonical: true,
        canonicalRecord: canonical.record,
        memory: canonical.memory,
      };
    },
    persistCanonicalWritableMemoryContext: async (context, memory, nowTs) => {
      persistCalls += 1;
      if (persistCalls === 1) {
        const competingRead = await stores.writer.read({ userId });
        const competing = sanitize(competingRead.memory);
        competing.turnHistory.push({
          turn: 2,
          content: "Mara hears the projector start on iPhone.",
          ts: 115,
        });
        await stores.writer.commit({
          userId,
          expectedRecord: competingRead.record,
          memory: competing,
          now: 115,
        });
      }
      return stores.reader.commit({
        userId,
        expectedRecord: context.canonicalRecord,
        memory,
        now: nowTs,
      });
    },
    sanitizeMemory: sanitize,
    initializeNewSessionMemory: initializeSession,
    buildConversationHistoryThreads: buildThreads,
    maybeBackfillThemesFromHistory: noBackfill,
  });

  assert.equal(persistCalls, 2);
  assert.equal(restored.memory.sessionStartedAt, 110);
  assert.equal(restored.memory.turnHistory.at(-1).turn, 2);
  assert.equal(activeSession.memory.turnHistory.at(-1).turn, 2);
  const durable = await stores.writer.read({ userId });
  assert.equal(durable.memory.sessionStartedAt, 110);
  assert.equal(durable.memory.turnHistory.at(-1).turn, 2);
});

test("session theme backfill commits through canonical memory", async () => {
  const userId = "writer-session-backfill";
  const stores = createStores("io-them-session-backfill-");
  const initial = await stores.writer.read({
    userId,
    fallbackMemory: {
      lastUpdatedAt: 100,
      turnHistory: [{ turn: 1, content: "Mara returns to the archive.", ts: 100 }],
    },
  });
  await stores.writer.commit({
    userId,
    expectedRecord: initial.record,
    memory: initial.memory,
    now: 100,
  });
  const canonical = await stores.reader.read({ userId });
  const context = {
    authenticatedUserId: userId,
    canonical: true,
    canonicalRecord: canonical.record,
    memory: canonical.memory,
  };
  const restored = await restoreAuthenticatedSessionMemory({
    req: {},
    token: "session-backfill",
    activeSession: { memory: canonical.memory },
    isNewSession: false,
    nowTs: 120,
    resolveCanonicalWritableMemoryContext: async () => context,
    persistCanonicalWritableMemoryContext: async (candidateContext, memory, nowTs) => stores.reader.commit({
      userId,
      expectedRecord: candidateContext.canonicalRecord,
      memory,
      now: nowTs,
    }),
    sanitizeMemory: sanitize,
    initializeNewSessionMemory: initializeSession,
    buildConversationHistoryThreads: buildThreads,
    maybeBackfillThemesFromHistory: (memory) => {
      if (memory.activeThemes?.length) return noBackfill();
      memory.activeThemes = [{ key: "archive", label: "Archive" }];
      return { applied: true, created: 1, trigger: "session_load", keys: ["archive"] };
    },
  });

  assert.equal(restored.backfillResult.applied, true);
  assert.equal(restored.memory.activeThemes[0].key, "archive");
  const durable = await stores.writer.read({ userId });
  assert.equal(durable.memory.activeThemes[0].key, "archive");
});
