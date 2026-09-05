import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCreativeMemoryRevision,
  buildCharacterFieldProvenance,
  buildProjectFieldProvenance,
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

function nestedRecords(dateFields = {}) {
  return {
    projects: [{
      projectId: "legacy-project",
      acceptedScenes: [{ summary: "The ferry waits in silence.", ...dateFields }],
      authoritativeFields: [{ field: "themeArgument", value: "Trust requires honesty.", ...dateFields }],
      learnedFields: [{ field: "centralQuestion", value: "Will Mara trust Eli?", ...dateFields }],
      writerCanonFacts: [{ fact: "Mara waits at the ferry.", replacesFacts: ["Mara left town."], ...dateFields }],
      questionEffectiveness: [{
        questionId: "legacy-question", targetField: "project.central_question",
        responseStatus: "answered", ...dateFields, askedAt: firstTime - 1,
      }],
    }],
    characters: [{ name: "Mara", bible: {
      canon: ["Mara waits at the ferry."],
      authoritativeFields: [{ field: "need", value: "Trust Eli.", ...dateFields }],
      learnedFields: [{ field: "want", value: "Catch the ferry.", ...dateFields }],
      ...dateFields,
    } }],
    episodicMemories: [{
      id: "legacy-episode", summary: "The ferry waits in silence.",
      embedding: { model: "fixture", textHash: "fixture-hash", vector: [1, 0], ...dateFields },
    }],
  };
}

async function nestedSnapshot(data) {
  const ledger = await data.ledger();
  return {
    ledger,
    revision: buildCreativeMemoryRevision(data.readStored()),
    projectProvenance: buildProjectFieldProvenance(ledger.projects[0]),
    characterProvenance: buildCharacterFieldProvenance(ledger.characters[0].bible),
  };
}

test("nested legacy provenance and revisions do not acquire dates when read", async () => {
  for (const value of [undefined, null, 0, -1, NaN, Infinity, "invalid", "Infinity", true, {}, []]) {
    const data = fixture(nestedRecords({
      createdAt: value, learnedAt: value, acceptedAt: value, updatedAt: value,
      answeredAt: value, respondedAt: value,
    }));
    const before = data.readStored();
    const first = await atTime(firstTime, () => nestedSnapshot(data));
    const second = await atTime(secondTime, () => nestedSnapshot(data));
    assert.deepEqual(second, first);
    const project = first.ledger.projects[0];
    assert.equal(project.acceptedScenes[0].acceptedAt, 0);
    assert.equal(project.acceptedScenes[0].updatedAt, 0);
    assert.equal(project.authoritativeFields[0].createdAt, 0);
    assert.equal(project.learnedFields[0].learnedAt, 0);
    assert.equal(project.learnedFields[0].updatedAt, 0);
    assert.equal(project.writerCanonFacts[0].createdAt, 0);
    assert.equal(project.writerCanonFacts[0].updatedAt, 0);
    assert.equal(project.questionEffectiveness[0].responseStatus, "answered");
    assert.equal(project.questionEffectiveness[0].answeredAt, undefined);
    assert.equal(project.questionEffectiveness[0].respondedAt, undefined);
    assert.equal(project.questionEffectiveness[0].updatedAt, firstTime - 1);
    for (const rows of [first.projectProvenance, first.characterProvenance]) {
      assert.equal(rows.length, 2);
      for (const row of rows) {
        assert.equal(row.learnedAt, 0);
        assert.equal(row.updatedAt, 0);
      }
    }
    assert.deepEqual(data.readStored(), before);
    assert.equal(data.writeCount(), 0);
  }
});

test("nested stored timestamp aliases and future dates retain their actual values", async () => {
  const future = secondTime + 86_400_000;
  const data = fixture(nestedRecords({
    created_at: String(firstTime), learned_at: String(firstTime),
    accepted_at: String(firstTime), updated_at: future,
    answered_at: String(secondTime), responded_at: future,
  }));
  const snapshot = await atTime(firstTime - 10, () => nestedSnapshot(data));
  const project = snapshot.ledger.projects[0];
  assert.equal(project.acceptedScenes[0].acceptedAt, firstTime);
  assert.equal(project.acceptedScenes[0].updatedAt, future);
  assert.equal(project.authoritativeFields[0].createdAt, firstTime);
  assert.equal(project.learnedFields[0].learnedAt, firstTime);
  assert.equal(project.learnedFields[0].updatedAt, future);
  assert.equal(project.writerCanonFacts[0].createdAt, firstTime);
  assert.equal(project.writerCanonFacts[0].updatedAt, future);
  assert.equal(project.questionEffectiveness[0].answeredAt, secondTime);
  assert.equal(project.questionEffectiveness[0].respondedAt, future);
  for (const rows of [snapshot.projectProvenance, snapshot.characterProvenance]) {
    assert.equal(rows.find((row) => row.status === "corrected").updatedAt, firstTime);
    assert.equal(rows.find((row) => row.status === "current").updatedAt, future);
  }
});

test("reading an undated project does not invalidate a later reviewed mutation", async () => {
  const data = fixture(nestedRecords());
  const revision = await atTime(firstTime, () => buildCreativeMemoryRevision(data.readStored()));
  const result = await atTime(secondTime, () => data.store.updateStoryMovePreference({
    userId, projectId: "legacy-project", action: "reset_all", expectedRevision: revision,
  }));
  assert.equal(result.ok, true);
  assert.equal(data.writeCount(), 1);
  assert.equal((await data.ledger()).projects[0].acceptedScenes[0].acceptedAt, 0);
});

test("an unrelated episode write preserves an undated stored embedding", async () => {
  const data = fixture(nestedRecords());
  await atTime(secondTime, () => data.store.recordEpisodicMemory({
    userId, summary: "An astronomer opens the observatory dome.", projectId: "another-project",
  }));
  const legacy = data.readStored().episodicMemories.find((item) => item.id === "legacy-episode");
  assert.equal(legacy.embedding.updatedAt, 0);
  assert.deepEqual(legacy.embedding.vector, [1, 0]);
});

test("new character Bible writes still record their real creation and update time", async () => {
  const data = fixture();
  const write = () => data.store.recordCharacterMention({
    userId, characterName: "Mara", characterBible: { arc: { need: "Trust Eli." } },
  });
  await atTime(firstTime, write);
  assert.equal(data.readStored().characters[0].bible.updatedAt, firstTime);
  await atTime(secondTime, write);
  assert.equal(data.readStored().characters[0].bible.updatedAt, secondTime);
});
