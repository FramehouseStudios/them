import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test("a cross-instance clear fences stale turns while allowing fresh learning", async () => {
  const jsonRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-memory-clear-fence-"));
  const iphonePersistenceBase = createJsonPersistence({ jsonRoot });
  const macPersistence = createJsonPersistence({ jsonRoot });
  const staleWriteEntered = deferred();
  const releaseStaleWrite = deferred();
  let gateNextWrite = false;
  const iphonePersistence = {
    ...iphonePersistenceBase,
    async compareAndSwap(args) {
      if (gateNextWrite) {
        gateNextWrite = false;
        staleWriteEntered.resolve();
        await releaseStaleWrite.promise;
      }
      return iphonePersistenceBase.compareAndSwap(args);
    },
  };
  const iphoneStore = createCreativeMemoryStore({ persistence: iphonePersistence });
  const macStore = createCreativeMemoryStore({ persistence: macPersistence });
  const userId = "writer-clear-fence";

  await iphoneStore.recordTriggersFromTalkTurn({
    userId,
    turnStartedAt: Date.now(),
    transcript: "Remember that Mara abandons Eli at the east ferry dock.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    projectContinuity: {
      projectId: "split-ferries",
      projectTitle: "Split Ferries",
      currentBeat: "Mara abandons Eli at the east ferry dock.",
    },
  });
  assert.equal(await iphoneStore.hasMemoryForUser(userId), true);

  const staleTurnStartedAt = Date.now();
  gateNextWrite = true;
  const stalePromise = iphoneStore.recordTriggersFromTalkTurn({
    userId,
    turnStartedAt: staleTurnStartedAt,
    transcript: "Remember that Eli steals the ferry and leaves Mara behind.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    projectContinuity: {
      projectId: "split-ferries",
      projectTitle: "Split Ferries",
      currentBeat: "Eli steals the ferry and leaves Mara behind.",
    },
  });
  await staleWriteEntered.promise;
  const receipt = await macStore.clearUserMemory({ userId });
  const tombstone = await macPersistence.get({ domain: "creative_memory", key: userId });
  releaseStaleWrite.resolve();
  const stale = await stalePromise;

  assert.deepEqual(receipt, { ok: true, cleared: true, userId });
  assert.ok(tombstone.clearedAt >= staleTurnStartedAt);
  assert.deepEqual(tombstone.projects, []);
  assert.deepEqual(tombstone.characters, []);
  assert.deepEqual(tombstone.episodicMemories, []);
  assert.equal(await iphoneStore.getCreativeMemoryForPrompt({ userId }), null);
  assert.equal(await macStore.getCreativeMemoryLedger({ userId }), null);

  assert.equal(stale.skipped, true);
  assert.equal(stale.reason, "cleared_during_turn");
  assert.equal(await iphoneStore.hasMemoryForUser(userId), false);

  const freshTurnStartedAt = tombstone.clearedAt + 1;
  const fresh = await macStore.recordTriggersFromTalkTurn({
    userId,
    turnStartedAt: freshTurnStartedAt,
    transcript: "Remember that Mara goes back for both Eli and June.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    projectContinuity: {
      projectId: "split-ferries",
      projectTitle: "Split Ferries",
      currentBeat: "Mara goes back for both Eli and June.",
    },
  });

  assert.notEqual(fresh.skipped, true);
  const learned = await iphoneStore.getCreativeMemoryForPrompt({
    userId,
    projectId: "split-ferries",
  });
  assert.equal(learned.projectContinuity.currentBeat, "Mara goes back for both Eli and June.");

  const replay = await iphoneStore.recordTriggersFromTalkTurn({
    userId,
    turnStartedAt: staleTurnStartedAt,
    transcript: "Remember the old version: Mara abandons everyone.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    projectContinuity: {
      projectId: "split-ferries",
      projectTitle: "Split Ferries",
      currentBeat: "Mara abandons everyone.",
    },
  });
  const restored = createCreativeMemoryStore({
    persistence: createJsonPersistence({ jsonRoot }),
  });
  const afterReplay = await restored.getCreativeMemoryForPrompt({
    userId,
    projectId: "split-ferries",
  });

  assert.equal(replay.skipped, true);
  assert.equal(replay.reason, "cleared_during_turn");
  assert.equal(afterReplay.projectContinuity.currentBeat, "Mara goes back for both Eli and June.");
  assert.equal(
    (await iphonePersistence.get({ domain: "creative_memory", key: userId })).clearedAt,
    tombstone.clearedAt,
  );
});

test("every live creative-memory trigger carries its turn origin timestamp", () => {
  const indexSource = fs.readFileSync(path.join(BACKEND_ROOT, "index.js"), "utf8");
  const talkSource = fs.readFileSync(path.join(BACKEND_ROOT, "lib/talk_handler.js"), "utf8");
  const realtimeSource = fs.readFileSync(
    path.join(BACKEND_ROOT, "lib/realtime_turn_commit_route.js"),
    "utf8",
  );
  const questionSource = fs.readFileSync(
    path.join(BACKEND_ROOT, "lib/screenplay_question_routes.js"),
    "utf8",
  );

  assert.match(indexSource, /recordTriggersFromTalkTurn\(\{[\s\S]*?turnStartedAt,/);
  assert.doesNotMatch(indexSource, /body\.turn_started_at|body\.turnStartedAt/);
  assert.match(talkSource, /recordCreativeMemoryTriggersForRequest\(req, \{[\s\S]*?turnStartedAt: t0,/);
  assert.match(realtimeSource, /recordCreativeMemoryTriggersForRequest\(req, \{[\s\S]*?turnStartedAt: nowTs,/);
  assert.match(questionSource, /recordCreativeMemoryTriggersForRequest\(req, \{[\s\S]*?turnStartedAt: now,/);
});
