import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCreativeMemoryRevision,
  createCreativeMemoryStore,
  CREATIVE_MEMORY_SCHEMA_VERSION,
} from "../lib/creative_memory_store.js";

const userId = "recency-writer";
const firstTime = 1_800_000_000_000;
const secondTime = firstTime + 86_400_000;

function fixture(fields = null) {
  let record = fields === null ? null : {
    userId,
    version: CREATIVE_MEMORY_SCHEMA_VERSION,
    updatedAt: 0,
    ...structuredClone(fields),
  };
  let writes = 0;
  const store = createCreativeMemoryStore({
    persistence: {
      async get({ domain, key }) {
        assert.equal(domain, "creative_memory");
        assert.equal(key, userId);
        return structuredClone(record);
      },
      async put({ value }) {
        record = structuredClone(value);
        writes += 1;
      },
    },
  });
  return {
    store,
    readStored: () => structuredClone(record),
    writeCount: () => writes,
    ledger: () => store.getCreativeMemoryLedger({ userId, requireValidRecord: true }),
  };
}

async function atTime(timestamp, run) {
  const originalNow = Date.now;
  Date.now = () => timestamp;
  try {
    return await run();
  } finally {
    Date.now = originalNow;
  }
}

function undatedRecords() {
  return {
    projects: [{ projectId: "legacy-project", currentBeat: "The ferry waits in silence." }],
    episodicMemories: [{ id: "legacy-episode", summary: "The ferry waits in silence." }],
  };
}

test("undated legacy ledger reads and revisions stay stable without persistence writes", async () => {
  const data = fixture(undatedRecords());
  const before = data.readStored();
  const read = async () => ({
    ledger: await data.ledger(),
    revision: buildCreativeMemoryRevision(data.readStored()),
  });
  const first = await atTime(firstTime, read);
  const second = await atTime(secondTime, read);

  assert.deepEqual(second, first);
  assert.equal(first.ledger.projects[0].updatedAt, 0);
  const episode = first.ledger.episodicMemories[0];
  assert.equal(episode.createdAt, 0);
  assert.equal(episode.updatedAt, 0);
  assert.equal(episode.lastReferencedAt, 0);
  assert.deepEqual(data.readStored(), before);
  assert.equal(data.writeCount(), 0);
});

test("invalid project and episode timestamps normalize to zero", async () => {
  for (const value of [undefined, null, 0, -1, NaN, Infinity, -Infinity, "invalid", "Infinity", true, {}, []]) {
    const data = fixture({
      projects: [{ projectId: "invalid-dates", updatedAt: value }],
      episodicMemories: [{
        id: "invalid-episode", summary: "The ferry waits in silence.",
        createdAt: value, updatedAt: value, lastReferencedAt: value, supersededAt: value,
      }],
    });
    const ledger = await atTime(firstTime, data.ledger);
    assert.equal(ledger.projects[0].updatedAt, 0);
    const episode = ledger.episodicMemories[0];
    assert.equal(episode.createdAt, 0);
    assert.equal(episode.updatedAt, 0);
    assert.equal(episode.lastReferencedAt, 0);
    assert.equal(episode.supersededAt, undefined);
    assert.equal(data.writeCount(), 0);
  }
});

test("stored positive timestamps and numeric aliases remain intact even in the future", async () => {
  const future = secondTime + 86_400_000;
  const data = fixture({
    projects: [{ projectId: "future-project", updated_at: String(future) }],
    episodicMemories: [{
      id: "future-episode", summary: "The ferry waits in silence.",
      created_at: String(firstTime), updated_at: secondTime,
      last_referenced_at: future, superseded_at: future,
    }],
  });
  const ledger = await atTime(firstTime - 1, data.ledger);
  assert.equal(ledger.projects[0].updatedAt, future);
  const episode = ledger.episodicMemories[0];
  assert.equal(episode.createdAt, firstTime);
  assert.equal(episode.updatedAt, secondTime);
  assert.equal(episode.lastReferencedAt, future);
  assert.equal(episode.supersededAt, future);
  assert.equal(data.writeCount(), 0);
});

test("episode update and reference fallbacks preserve creation ordering and explicit zero", async () => {
  const data = fixture({ episodicMemories: [
    { id: "created-only", summary: "Only creation is dated.", createdAt: firstTime },
    { id: "older-update", summary: "An earlier update cannot predate creation.", createdAt: firstTime, updatedAt: 1 },
    { id: "invalid-update", summary: "An invalid update falls back to creation.", createdAt: firstTime, updatedAt: "bad" },
    { id: "zero-reference", summary: "An explicit reference zero stays unknown.", createdAt: firstTime, lastReferencedAt: 0 },
    { id: "invalid-reference", summary: "An invalid reference stays unknown.", createdAt: firstTime, lastReferencedAt: "bad" },
  ] });
  const ledger = await atTime(secondTime, data.ledger);
  const episodes = new Map(ledger.episodicMemories.map((item) => [item.id, item]));
  for (const id of ["created-only", "older-update", "invalid-update"]) {
    assert.equal(episodes.get(id).updatedAt, firstTime);
    assert.equal(episodes.get(id).lastReferencedAt, firstTime);
  }
  assert.equal(episodes.get("zero-reference").lastReferencedAt, 0);
  assert.equal(episodes.get("invalid-reference").lastReferencedAt, 0);
});

test("real project creation and update events set their actual write times", async () => {
  const data = fixture();
  const write = () => data.store.recordProjectContinuity({
    userId, continuity: { projectId: "new-project", currentBeat: "The ferry departs." },
  });
  await atTime(firstTime, write);
  assert.equal((await data.ledger()).projects[0].updatedAt, firstTime);
  await atTime(secondTime, write);
  assert.equal((await data.ledger()).projects[0].updatedAt, secondTime);
  assert.equal(data.writeCount(), 2);
});

test("episode creation, update, and explicit recall retain real event timestamps", async () => {
  const data = fixture();
  const write = () => data.store.recordEpisodicMemory({
    userId, summary: "Mara hides the affidavit under the courthouse vent.",
    characterNames: ["Mara"], projectId: "new-project",
  });
  await atTime(firstTime, write);
  let episode = (await data.ledger()).episodicMemories[0];
  assert.equal(episode.createdAt, firstTime);
  assert.equal(episode.updatedAt, firstTime);
  assert.equal(episode.lastReferencedAt, firstTime);

  await atTime(secondTime, write);
  episode = (await data.ledger()).episodicMemories[0];
  assert.equal(episode.createdAt, firstTime);
  assert.equal(episode.updatedAt, secondTime);
  assert.equal(episode.lastReferencedAt, secondTime);

  const recallTime = secondTime + 1_000;
  await atTime(recallTime, () => data.store.getCreativeMemoryForPrompt({
    userId, projectId: "new-project", query: "Mara and the affidavit", recordEpisodicRecall: true,
  }));
  episode = (await data.ledger()).episodicMemories[0];
  assert.equal(episode.createdAt, firstTime);
  assert.equal(episode.updatedAt, secondTime);
  assert.equal(episode.lastReferencedAt, recallTime);
  assert.equal(episode.referenceCount, 3);

  const beforeRead = data.readStored();
  const writes = data.writeCount();
  await atTime(recallTime + 1_000, () => data.store.getCreativeMemoryForPrompt({
    userId, projectId: "new-project", query: "Mara and the affidavit",
  }));
  assert.deepEqual(data.readStored(), beforeRead);
  assert.equal(data.writeCount(), writes);
});

test("unrelated project and episode writes do not freshen undated legacy records", async () => {
  const data = fixture(undatedRecords());
  await atTime(firstTime, () => data.store.recordProjectContinuity({
    userId, continuity: { projectId: "another-project", currentBeat: "The observatory opens." },
  }));
  await atTime(secondTime, () => data.store.recordEpisodicMemory({
    userId, projectId: "another-project", summary: "An astronomer opens the observatory dome.",
  }));
  const ledger = await data.ledger();
  assert.equal(ledger.projects.find((item) => item.projectId === "legacy-project").updatedAt, 0);
  const episode = ledger.episodicMemories.find((item) => item.id === "legacy-episode");
  assert.equal(episode.createdAt, 0);
  assert.equal(episode.updatedAt, 0);
  assert.equal(episode.lastReferencedAt, 0);
  assert.equal(data.writeCount(), 2);
});
