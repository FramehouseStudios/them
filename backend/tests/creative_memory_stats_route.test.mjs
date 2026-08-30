// T-creative-memory-stats-route — unit + integration tests.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import {
  mountCreativeMemoryStatsRoute,
  summarizeMemory,
  CREATIVE_MEMORY_STATS_SCHEMA_VERSION,
} from "../lib/creative_memory_stats_route.js";

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-memstats-"));
  return createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
}

// ---------- summarizer ----------

test("[memory-stats] null memory → zero envelope", () => {
  const s = summarizeMemory(null);
  assert.equal(s.schemaVersion, CREATIVE_MEMORY_STATS_SCHEMA_VERSION);
  assert.equal(s.hasMemory, false);
  assert.equal(s.counts.characters, 0);
});

test("[memory-stats] counts characters, voice-bearing, trait-bearing", () => {
  const s = summarizeMemory({
    characters: [
      { name: "A", voice: "wry" },
      { name: "B", voice: "" },
      { name: "C", voice: "stoic", traits: { speech_style: { pace: "terse" } } },
    ],
    updatedAt: 1234,
  });
  assert.equal(s.counts.characters, 3);
  assert.equal(s.counts.charactersWithVoice, 2);
  assert.equal(s.counts.charactersWithTraits, 1);
  assert.equal(s.hasMemory, true);
  assert.equal(s.lastUpdatedMs, 1234);
});

test("[memory-stats] tone + habit signals count by key", () => {
  const s = summarizeMemory({
    characters: [],
    tone: { emotional_default: "wry", humor_register: "absurd" },
    habits: { session_pattern: "evenings" },
  });
  assert.equal(s.counts.toneSignals, 2);
  assert.equal(s.counts.habitSignals, 1);
});

test("[memory-stats] no leakage: response shape contains no character names", () => {
  const s = summarizeMemory({
    characters: [{ name: "June", voice: "wry" }],
  });
  const serialized = JSON.stringify(s);
  assert.ok(!serialized.includes("June"));
  assert.ok(!serialized.includes("wry"));
});

// ---------- endpoint integration ----------

async function withTestServer(fn, { userId = "u-test", seed = null } = {}) {
  const store = freshStore();
  if (seed) await seed(store);
  const app = express();
  if (userId !== null) {
    app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  }
  mountCreativeMemoryStatsRoute(app, { creativeMemoryStore: store });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[memory-stats] GET /memory/stats returns zero envelope for cold user", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/memory/stats");
    assert.equal(r.status, 200);
    assert.equal(r.body.hasMemory, false);
    assert.equal(r.body.counts.characters, 0);
  });
});

test("[memory-stats] GET /memory/stats reflects recorded memory", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/memory/stats");
      assert.equal(r.status, 200);
      assert.equal(r.body.hasMemory, true);
      assert.equal(r.body.counts.characters, 2);
      assert.equal(r.body.counts.charactersWithVoice, 1);
      assert.ok(r.body.counts.toneSignals >= 1);
    },
    {
      seed: async (store) => {
        await store.recordCharacterMention({ userId: "u-test", characterName: "June", voice: "wry" });
        await store.recordCharacterMention({ userId: "u-test", characterName: "Marcus" });
        await store.recordToneSignal({ userId: "u-test", signal: { emotional_default: "wry" } });
      },
    },
  );
});

test("[memory-stats] GET /memory/stats unauthenticated returns 401", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/memory/stats");
      assert.equal(r.status, 401);
      assert.equal(r.body.error, "user_auth_required");
    },
    { userId: null },
  );
});

test("[memory-stats] mountCreativeMemoryStatsRoute requires an Express app", () => {
  assert.throws(() => mountCreativeMemoryStatsRoute(null, { creativeMemoryStore: {} }));
});

test("[memory-stats] mountCreativeMemoryStatsRoute requires a store", () => {
  const app = express();
  assert.throws(() => mountCreativeMemoryStatsRoute(app, {}));
});
