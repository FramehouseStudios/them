import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountDataRoutes } from "../lib/data_routes.js";

async function withServer({ clearCreativeMemory }, run) {
  const events = [];
  const app = express();
  app.use((req, _res, next) => {
    req.authUser = { id: "writer-a" };
    next();
  });
  mountDataRoutes(app, {
    logger: { log: () => {} },
    applyReadStateHeaders: () => {},
    buildReadStateMeta: () => ({
      sessionId: "session-a",
      stateVersion: "state-2",
      lastTurnId: "turn-9",
      lastUpdatedAt: 2,
      historyUpdatedAt: 2,
      memoryUpdatedAt: 2,
      backendBootId: "boot-a",
      schemaVersion: 1,
      backendBuild: "test",
    }),
    clearAllMemoriesMemory: (memory) => {
      events.push("legacy-memory-cleared");
      return { ...memory, memories: [] };
    },
    clearConversationHistoryMemory: (memory) => memory,
    createRequestId: () => "request-a",
    creativeMemoryStore: {
      clearUserMemory: async ({ userId }) => {
        events.push(`creative-memory-cleared:${userId}`);
        return clearCreativeMemory({ userId });
      },
    },
    persistWritableMemoryContext: (_context, memory) => memory,
    resolveWritableMemoryContext: () => ({
      memory: { memories: ["old"] },
      requesterIp: "127.0.0.1",
      clientToken: "client-a",
    }),
  });
  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: error.message });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  try {
    await run({ baseURL: `http://127.0.0.1:${address.port}`, events });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("POST /data/memories/clear erases authenticated creative memory before legacy memory", async () => {
  await withServer({
    clearCreativeMemory: async () => ({ ok: true, cleared: true }),
  }, async ({ baseURL, events }) => {
    const response = await fetch(`${baseURL}/data/memories/clear`, { method: "POST" });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.action, "clear_memories");
    assert.deepEqual(events, [
      "creative-memory-cleared:writer-a",
      "legacy-memory-cleared",
    ]);
  });
});

test("POST /data/memories/clear does not claim success when creative erasure fails", async () => {
  await withServer({
    clearCreativeMemory: async () => {
      throw new Error("creative delete unavailable");
    },
  }, async ({ baseURL, events }) => {
    const response = await fetch(`${baseURL}/data/memories/clear`, { method: "POST" });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.error, "creative delete unavailable");
    assert.deepEqual(events, ["creative-memory-cleared:writer-a"]);
  });
});
