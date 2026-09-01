import test from "node:test";
import assert from "node:assert/strict";

import {
  MEMORY_TOOL_NAMES,
  MEMORY_KINDS,
  buildMemoryToolSchemas,
  createMemoryTools,
  shouldCompact,
  compactWorkingSet,
  buildWorkingSetState,
  createMemoryCompactionJob,
} from "../lib/clementine/index.js";

test("[clementine memory] tool schemas expose write/read/search with defer_loading", () => {
  const schemas = buildMemoryToolSchemas();
  const names = schemas.map((s) => s.name).sort();
  assert.deepEqual(names, [
    MEMORY_TOOL_NAMES.READ,
    MEMORY_TOOL_NAMES.SEARCH,
    MEMORY_TOOL_NAMES.WRITE,
  ].sort());
  for (const s of schemas) {
    assert.equal(s.type, "function");
    assert.equal(s.defer_loading, true);
    assert.equal(s.parameters?.type, "object");
    assert.equal(typeof s.description, "string");
    assert.ok(s.description.length > 10);
  }
  const write = schemas.find((s) => s.name === MEMORY_TOOL_NAMES.WRITE);
  assert.deepEqual(write.parameters.properties.kind.enum, [
    MEMORY_KINDS.SEMANTIC_PROFILE,
    MEMORY_KINDS.EPISODIC_NOTE,
  ]);
});

test("[clementine memory] memory_write / read / search scratch path", async () => {
  const tools = createMemoryTools({ now: () => 1_700_000_100_000 });
  const w = await tools.memoryWrite(
    {
      kind: MEMORY_KINDS.EPISODIC_NOTE,
      summary: "Maya leaves before he answers",
      tags: ["scene"],
      character_names: ["Maya"],
    },
    { userId: "u1" }
  );
  assert.equal(w.ok, true);
  assert.equal(w.kind, MEMORY_KINDS.EPISODIC_NOTE);
  assert.equal(w.via, "scratch");

  const profile = await tools.memoryWrite(
    {
      kind: MEMORY_KINDS.SEMANTIC_PROFILE,
      profile_patch: { preferredTone: "wry", habitsNote: "late-night bursts" },
    },
    { userId: "u1" }
  );
  assert.equal(profile.ok, true);

  const read = await tools.memoryRead({ kind: "all", limit: 4 }, { userId: "u1" });
  assert.equal(read.ok, true);
  assert.equal(read.semantic_profile.preferredTone, "wry");
  assert.equal(read.episodic.length, 1);
  assert.match(read.episodic[0].summary, /Maya/);

  const search = await tools.memorySearch({ query: "maya leaves" }, { userId: "u1" });
  assert.equal(search.ok, true);
  assert.equal(search.strategy, "keyword_stub");
  assert.equal(search.results.length, 1);

  const miss = await tools.dispatch("memory_search", { query: "xylophone" }, { userId: "u1" });
  assert.equal(miss.results.length, 0);
});

test("[clementine memory] DI hooks creative_memory_store recordEpisodicMemory", async () => {
  const calls = [];
  const tools = createMemoryTools({
    creativeMemoryStore: {
      async recordEpisodicMemory(payload) {
        calls.push(payload);
        return { ok: true, action: "recorded", memoryId: "ep_di_1" };
      },
    },
  });
  const w = await tools.memoryWrite(
    { kind: "episodic_note", summary: "twist lands cold" },
    { userId: "u-di" }
  );
  assert.equal(w.via, "creative_memory_store");
  assert.equal(w.memoryId, "ep_di_1");
  assert.equal(calls[0].userId, "u-di");
  assert.equal(calls[0].source, "clementine_memory_write");
});

test("[clementine memory] shouldCompact + working set leaves always-on prefix alone", () => {
  assert.equal(shouldCompact({ turns: Array.from({ length: 5 }, (_, i) => `t${i}`) }), false);
  assert.equal(shouldCompact({ turns: Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `turn ${i}` })) }), true);
  assert.equal(shouldCompact({ turns: [], tokenEstimate: 9_000 }), true);

  const turns = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hey" },
    { role: "user", content: "continue the scene with Maya" },
    { role: "assistant", content: "She is already gone." },
    { role: "user", content: "make it colder" },
  ];
  const compact = compactWorkingSet(turns, { keepLast: 2, maxSummaryChars: 500 });
  assert.equal(compact.keptRecentTurnCount, 2);
  assert.ok(compact.foldedTurnCount >= 3);
  assert.match(compact.summary.text, /Maya|hey|hi/i);

  const prefix = "You are Clementine.\n\nShort by default.";
  const state = buildWorkingSetState({
    alwaysOnPrefix: prefix,
    turns,
    forceCompact: true,
    compactOptions: { keepLast: 1 },
  });
  assert.equal(state.alwaysOnPrefix, prefix);
  assert.equal(state.didCompact, true);
  assert.equal(state.alwaysOnPrefix.includes("Maya"), false);
  assert.match(state.dynamicTailHint, /Working-set digest|Recent turns/);
});

test("[clementine memory] compaction job enqueue + run once (Spark no-op)", async () => {
  const sparkCalls = [];
  const jobber = createMemoryCompactionJob({
    now: () => 1_700_000_200_000,
    runSparkCompaction: async (userId, payload) => {
      sparkCalls.push({ userId, payload });
      // Callers must pass background: true for non-interactive Spark compaction.
      assert.equal(payload.background, true);
      assert.equal(payload.store, false);
      return { ok: true, spark: "noop_ok" };
    },
  });

  assert.equal(jobber.queueDepth(), 0);
  const empty = await jobber.runCompactionOnce();
  assert.equal(empty.ran, false);

  const enq = jobber.enqueueCompaction("user-a", {
    turns: Array.from({ length: 18 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `line ${i} about the cold open`,
    })),
  });
  assert.equal(enq.ok, true);
  assert.equal(jobber.queueDepth(), 1);

  const ran = await jobber.runCompactionOnce();
  assert.equal(ran.ok, true);
  assert.equal(ran.ran, true);
  assert.equal(ran.job.status, "done");
  assert.equal(ran.job.userId, "user-a");
  assert.ok(ran.compact.summary?.text);
  assert.equal(sparkCalls.length, 1);
  assert.equal(sparkCalls[0].payload.background, true);
  assert.equal(jobber.queueDepth(), 0);
  assert.equal(jobber.getUserState("user-a").lastJobId, ran.job.id);

  assert.equal(jobber.enqueueCompaction("").ok, false);
});
