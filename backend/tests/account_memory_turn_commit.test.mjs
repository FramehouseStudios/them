import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createAccountMemoryCAS } from "../lib/account_memory_cas.js";
import {
  createAccountMemoryTurnCommitter,
  mergeConcurrentAccountMemory,
} from "../lib/account_memory_turn_commit.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

test("concurrent talk merge preserves corrected Story Spine and both device turns", () => {
  const base = {
    turns: 4,
    timeActiveDays: 1,
    lastUpdatedAt: 100,
    turnHistory: [{ role: "user", content: "base", ts: 10 }],
    screenplayProjectMemory: [{
      projectId: "split-ferries",
      currentBeat: "Mara abandons Eli.",
      correctedTerms: [],
      updatedAt: 100,
    }],
  };
  const candidate = clone(base);
  candidate.turns = 5;
  candidate.timeActiveDays = 2;
  candidate.lastUpdatedAt = 120;
  candidate.turnHistory.push({ role: "user", content: "iPhone turn", ts: 120 });
  candidate.screenplayProjectMemory[0].currentBeat = "Mara keeps walking.";
  candidate.screenplayProjectMemory[0].updatedAt = 120;

  const winner = clone(base);
  winner.turns = 5;
  winner.timeActiveDays = 2;
  winner.lastUpdatedAt = 115;
  winner.turnHistory.push({ role: "user", content: "Mac turn", ts: 115 });
  winner.screenplayProjectMemory[0] = {
    projectId: "split-ferries",
    currentBeat: "Mara goes back for both of them.",
    correctedTerms: ["abandons"],
    updatedAt: 115,
  };

  const merged = mergeConcurrentAccountMemory({
    baseMemory: base,
    candidateMemory: candidate,
    winnerMemory: winner,
  });
  assert.equal(merged.turns, 6);
  assert.equal(merged.timeActiveDays, 2);
  assert.deepEqual(
    merged.turnHistory.map((item) => item.content),
    ["base", "Mac turn", "iPhone turn"],
  );
  assert.equal(
    merged.screenplayProjectMemory[0].currentBeat,
    "Mara goes back for both of them.",
  );
  assert.deepEqual(merged.screenplayProjectMemory[0].correctedTerms, ["abandons"]);
});

test("a concurrent privacy clear cannot be undone by an in-flight talk turn", () => {
  const base = {
    turns: 3,
    historyClearedAt: 0,
    memoriesClearedAt: 0,
    listeningFacts: ["Mara fears the ferry."],
    turnHistory: [{ role: "user", content: "private", ts: 10 }],
    screenplayProjectMemory: [{ projectId: "split-ferries" }],
    lastUpdatedAt: 10,
  };
  const candidate = {
    ...clone(base),
    turns: 4,
    lastUpdatedAt: 30,
    listeningFacts: [...base.listeningFacts, "Eli has the key."],
    turnHistory: [...base.turnHistory, { role: "user", content: "in flight", ts: 30 }],
  };
  const winner = {
    ...clone(base),
    turns: 0,
    historyClearedAt: 20,
    memoriesClearedAt: 20,
    listeningFacts: [],
    turnHistory: [],
    screenplayProjectMemory: [],
    lastUpdatedAt: 20,
  };
  const merged = mergeConcurrentAccountMemory({
    baseMemory: base,
    candidateMemory: candidate,
    winnerMemory: winner,
  });
  assert.equal(merged.turns, 0);
  assert.deepEqual(merged.listeningFacts, []);
  assert.deepEqual(merged.turnHistory, []);
  assert.deepEqual(merged.screenplayProjectMemory, []);
});

test("bounded committer repairs a CAS loss and advances its baseline", async () => {
  const base = { turns: 2, turnHistory: [], lastUpdatedAt: 10 };
  const winner = {
    turns: 3,
    turnHistory: [{ role: "user", content: "Mac", ts: 20 }],
    lastUpdatedAt: 20,
  };
  const writes = [];
  const context = {
    memory: clone(base),
    canonicalRecord: { memory: clone(base) },
    activeSession: { memory: clone(base) },
  };
  const persistMemory = async (_context, memory) => {
    writes.push(clone(memory));
    if (writes.length === 1) {
      return {
        ok: false,
        status: "stale_memory_state_version",
        memory: clone(winner),
        record: { memory: clone(winner) },
      };
    }
    return {
      ok: true,
      status: "committed",
      memory: clone(memory),
      record: { memory: clone(memory) },
    };
  };
  const commit = createAccountMemoryTurnCommitter({
    context,
    persistMemory,
    sanitizeMemory: clone,
  });
  const iphone = {
    turns: 3,
    turnHistory: [{ role: "user", content: "iPhone", ts: 25 }],
    lastUpdatedAt: 25,
  };
  const first = await commit(iphone, 25);
  assert.equal(writes.length, 2);
  assert.equal(first.turns, 4);
  assert.deepEqual(first.turnHistory.map((item) => item.content), ["Mac", "iPhone"]);
  assert.deepEqual(context.activeSession.memory, first);

  const secondCandidate = clone(first);
  secondCandidate.turns += 1;
  secondCandidate.turnHistory.push({ role: "user", content: "Next", ts: 30 });
  secondCandidate.lastUpdatedAt = 30;
  const second = await commit(secondCandidate, 30);
  assert.equal(writes.length, 3);
  assert.equal(second.turns, 5);
});

test("queued saves rebase instead of replacing an earlier in-request commit", async () => {
  const base = { turns: 1, turnHistory: [], lastUpdatedAt: 10 };
  const context = { memory: clone(base), activeSession: { memory: clone(base) } };
  const persistMemory = async (_context, memory) => ({
    ok: true,
    status: "committed",
    memory: clone(memory),
    record: { memory: clone(memory) },
  });
  const commit = createAccountMemoryTurnCommitter({
    context,
    persistMemory,
    sanitizeMemory: clone,
  });
  const firstCandidate = {
    turns: 2,
    turnHistory: [{ role: "user", content: "first", ts: 20 }],
    lastUpdatedAt: 20,
  };
  const secondCandidate = {
    turns: 2,
    turnHistory: [{ role: "user", content: "second", ts: 21 }],
    lastUpdatedAt: 21,
  };
  const [first, second] = await Promise.all([
    commit(firstCandidate, 20),
    commit(secondCandidate, 21),
  ]);
  assert.equal(first.turns, 2);
  assert.equal(second.turns, 3);
  assert.deepEqual(second.turnHistory.map((item) => item.content), ["first", "second"]);
});

test("real independent stores merge a Studio correction into an in-flight voice turn", async () => {
  const jsonRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-talk-studio-race-"));
  const studioStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: clone,
  });
  const voiceStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: clone,
  });
  const cold = await studioStore.read({
    userId: "writer-cross-device",
    fallbackMemory: {
      turns: 8,
      turnHistory: [],
      screenplayProjectMemory: [{
        projectId: "split-ferries",
        currentBeat: "Mara abandons Eli.",
        correctedTerms: [],
        updatedAt: 100,
      }],
      lastUpdatedAt: 100,
    },
  });
  await studioStore.commit({
    userId: "writer-cross-device",
    expectedRecord: cold.record,
    memory: cold.memory,
    now: 100,
  });

  const studioRead = await studioStore.read({ userId: "writer-cross-device" });
  const voiceRead = await voiceStore.read({ userId: "writer-cross-device" });
  const voiceContext = {
    authenticatedUserId: "writer-cross-device",
    canonical: true,
    canonicalRecord: voiceRead.record,
    memory: voiceRead.memory,
    activeSession: { memory: voiceRead.memory },
  };
  const commitVoice = createAccountMemoryTurnCommitter({
    context: voiceContext,
    sanitizeMemory: clone,
    persistMemory: (context, memory, now) => voiceStore.commit({
      userId: context.authenticatedUserId,
      expectedRecord: context.canonicalRecord,
      memory,
      now,
    }),
  });

  const corrected = clone(studioRead.memory);
  corrected.screenplayProjectMemory[0] = {
    projectId: "split-ferries",
    currentBeat: "Mara goes back for Eli and June.",
    correctedTerms: ["abandons"],
    correctionReplacements: ["abandons Eli -> goes back for Eli and June"],
    updatedAt: 110,
  };
  await studioStore.commit({
    userId: "writer-cross-device",
    expectedRecord: studioRead.record,
    memory: corrected,
    now: 110,
  });

  const spoken = clone(voiceRead.memory);
  spoken.turns += 1;
  spoken.turnHistory.push({
    role: "user",
    content: "What if the ferry leaves before she reaches them?",
    ts: 120,
  });
  spoken.screenplayProjectMemory[0].currentBeat = "The ferry leaves without Eli.";
  spoken.screenplayProjectMemory[0].updatedAt = 120;
  spoken.lastUpdatedAt = 120;
  const merged = await commitVoice(spoken, 120);

  assert.equal(merged.turns, 9);
  assert.equal(merged.turnHistory.at(-1).content, "What if the ferry leaves before she reaches them?");
  assert.equal(
    merged.screenplayProjectMemory[0].currentBeat,
    "Mara goes back for Eli and June.",
  );
  assert.deepEqual(merged.screenplayProjectMemory[0].correctedTerms, ["abandons"]);
  const relaunched = await studioStore.read({ userId: "writer-cross-device" });
  assert.deepEqual(relaunched.memory, merged);
});

test("bounded committer fails closed after repeated contention", async () => {
  const context = { memory: { turns: 1, lastUpdatedAt: 1 } };
  const commit = createAccountMemoryTurnCommitter({
    context,
    persistMemory: async () => ({
      ok: false,
      status: "stale_memory_state_version",
      memory: { turns: 2, lastUpdatedAt: 2 },
      record: { memory: { turns: 2, lastUpdatedAt: 2 } },
    }),
    sanitizeMemory: clone,
    maxAttempts: 2,
  });
  await assert.rejects(
    commit({ turns: 2, lastUpdatedAt: 3 }),
    (error) => error.code === "memory_commit_conflict" && error.status === 503,
  );
});
