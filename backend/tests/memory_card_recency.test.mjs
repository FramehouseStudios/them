import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.RUN_SERVER = "0";
process.env.OUTBOX_SNAPSHOT_ENABLED = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";
process.env.DATABASE_URL = "";
process.env.SCALE_BACKPLANE_ENABLED = "0";
process.env.MEMORY_BACKFILL_MIN_HISTORY_TURNS = "3";
const importRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-card-recency-import-"));
process.env.PERSISTENCE_JSON_ROOT = path.join(importRoot, "persistence");
for (const variable of [
  "USER_MEMORY_STORE_PATH", "SCREENPLAY_STORE_PATH", "USER_STORE_PATH",
  "OUTBOX_STORE_PATH", "ASSISTANT_IDENTITY_STORE_PATH",
]) {
  process.env[variable] = path.join(importRoot, `${variable.toLowerCase()}.json`);
}

const { buildBackfilledThemesFromHistory, buildMemoryCards, createEmptyEmotionMemory } = await import("../index.js");
const { buildCreativeMemoryRevision, createCreativeMemoryStore } = await import("../lib/creative_memory_store.js");
const { createJsonPersistence } = await import("../lib/persistence_json.js");

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const DATED = NOW - 3 * DAY - DAY / 2;

async function withMockedNow(nowTs, fn) {
  const realNow = Date.now;
  Date.now = () => nowTs;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
  }
}

function timestamps(fields, value) {
  return value === undefined ? {} : Object.fromEntries(fields.map((field) => [field, value]));
}

const sources = [
  { name: "character_bible", score: 0.76, editable: true },
  { name: "canon_correction", score: 0.92, editable: false },
  { name: "canon_correction_undone", score: 0.68, editable: false },
  { name: "canon_correction_ambiguous", score: 0.74, editable: false },
  { name: "episodic_memory", score: 0.74, editable: false },
  { name: "episodic_correction", score: 0.86, editable: false },
  { name: "episodic_superseded", score: 0.32, editable: false },
  { name: "screenplay_project", score: 0.78, editable: true, noFeedback: true },
  { name: "classifier", score: 0.58, editable: true },
  { name: "history", score: 0.58, editable: false, noUse: true, noFeedback: true },
  { name: "recap", score: 0.58, editable: false, noUse: true, noFeedback: true },
];

function fixture(source, timestamp) {
  const memory = createEmptyEmotionMemory();
  const creativeMemory = { updatedAt: NOW };
  const history = [];
  if (source === "character_bible") {
    creativeMemory.characters = [{
      name: "Mara", voice: "Guarded, precise, dry under pressure.",
      ...timestamps(["first_seen", "last_referenced"], timestamp),
    }];
  } else if (source === "canon_correction" || source === "canon_correction_undone") {
    creativeMemory.canonCorrectionReceipts = [{
      id: "correction-one", status: source === "canon_correction_undone" ? "undone" : "active",
      projectId: "rain-docket", projectTitle: "Rain Docket",
      correctionText: "Mara keeps the affidavit.", matchedFacts: ["Mara burned the affidavit."],
      ...timestamps(source === "canon_correction_undone" ? ["createdAt", "undoneAt"] : ["createdAt"], timestamp),
    }];
  } else if (source === "canon_correction_ambiguous") {
    creativeMemory.canonCorrectionAmbiguities = [{
      id: "ambiguity-one", status: "pending", projectId: "rain-docket", projectTitle: "Rain Docket",
      correctionText: "Mara keeps the affidavit.",
      candidateFacts: ["Mara burned the affidavit.", "Mara gave the affidavit to Eli."],
      ...timestamps(["createdAt"], timestamp),
    }];
  } else if (source.startsWith("episodic_")) {
    creativeMemory.episodicMemories = [{
      id: "episode-one", summary: "Mara keeps the affidavit.", excerpt: "Mara folds the affidavit into her coat.",
      projectId: "rain-docket", projectTitle: "Rain Docket", characterNames: ["Mara"], referenceCount: 2,
      tags: source === "episodic_superseded" ? ["superseded"] : source === "episodic_correction" ? ["correction"] : [],
      ...timestamps(["createdAt", "updatedAt", "lastReferencedAt"], timestamp),
    }];
  } else if (source === "screenplay_project") {
    memory.screenplayProjectMemory = [{
      projectId: "rain-docket", projectTitle: "Rain Docket", currentBeat: "Mara keeps the affidavit.",
      ...timestamps(["createdAt", "updatedAt"], timestamp),
    }];
  } else if (source === "classifier") {
    memory.activeThemes = [{
      key: "trust", label: "Trust", summary: "Mara trusts Eli with the affidavit.", source,
      salience: 0.7, confidence: 0.8,
      ...timestamps(["lastMentionedAt", "lastUsedAt", "qualityLastFeedbackAt"], timestamp),
    }];
  } else if (source === "history") {
    history.push({
      id: "turn-one", turn: 1, title: "The affidavit", user: "Mara keeps the affidavit.",
      assistant: "She puts it in her coat.", ...timestamps(["updatedAt"], timestamp),
    });
  } else if (source === "recap") {
    memory.lastConversationRecap = "Mara keeps the affidavit.";
    Object.assign(memory, timestamps(["lastConversationAt"], timestamp));
  } else {
    throw new Error(`Unsupported fixture source: ${source}`);
  }
  return { memory, creativeMemory, history };
}

function cardsFor(value) {
  return buildMemoryCards(value.memory, value.history, 24, value.creativeMemory);
}

function cardFor(value, source) {
  const cards = cardsFor(value);
  assert.equal(cards.length, 1, `fixture for ${source} should produce one real card`);
  assert.equal(cards[0].source, source);
  return cards[0];
}

function assertUnknownRecency(card, message = "") {
  assert.equal(card.rememberedAt, 0, `${message}: rememberedAt`);
  assert.equal(card.lastUsedAt, 0, `${message}: lastUsedAt`);
  assert.equal(card.qualityLastFeedbackAt, 0, `${message}: qualityLastFeedbackAt`);
  assert.equal(card.stalenessDays, null, `${message}: stalenessDays`);
  assert.equal(card.stalenessBand, "unknown", `${message}: stalenessBand`);
}

function stableContent(card) {
  return Object.fromEntries([
    "id", "key", "title", "summary", "reason", "source", "editable", "salience", "confidence",
    "qualityScore", "qualityHitCount", "qualityCorrectionCount", "snippets", "referenceHint",
    "is_correction_memory", "is_superseded",
  ].map((field) => [field, card[field]]));
}

for (const spec of sources) {
  test(`[memory-card-recency] ${spec.name} preserves content and score while unknown timestamps stay unknown`, async () => {
    await withMockedNow(NOW, () => {
      const baseline = cardFor(fixture(spec.name, NOW), spec.name);
      assert.ok(Math.abs(baseline.qualityScore - spec.score) < 1e-12);
      assert.equal(baseline.editable, spec.editable);
      assert.ok(baseline.summary.length > 0);
      for (const [label, timestamp] of [
        ["missing", undefined], ["zero", 0], ["null", null], ["negative", -1],
        ["invalid", "not-a-timestamp"], ["nonfinite", NaN], ["infinite", Infinity], ["future", NOW + 60 * DAY],
      ]) {
        const card = cardFor(fixture(spec.name, timestamp), spec.name);
        assertUnknownRecency(card, label);
        assert.deepEqual(stableContent(card), stableContent(baseline), label);
      }
    });
  });

  test(`[memory-card-recency] ${spec.name} preserves supplied dates and computes elapsed whole days`, async () => {
    await withMockedNow(NOW, () => {
      const card = cardFor(fixture(spec.name, DATED), spec.name);
      assert.equal(card.rememberedAt, DATED);
      assert.equal(card.lastUsedAt, spec.noUse ? 0 : DATED);
      assert.equal(card.qualityLastFeedbackAt, spec.noFeedback ? 0 : DATED);
      assert.equal(card.stalenessDays, 3);
      assert.equal(card.stalenessBand, spec.name === "episodic_superseded" ? "stale" : "fresh");
      assert.equal(card.editable, spec.editable);
      if (spec.name === "episodic_superseded") assert.equal(card.is_superseded, true);
    });
  });
}

test("[memory-card-recency] unrelated ledger updates cannot date or freshen a character", async () => {
  await withMockedNow(NOW, () => {
    const undated = fixture("character_bible");
    undated.creativeMemory.updatedAt = NOW;
    assertUnknownRecency(cardFor(undated, "character_bible"));

    const dated = fixture("character_bible", DATED);
    dated.creativeMemory.updatedAt = NOW;
    const card = cardFor(dated, "character_bible");
    assert.equal(card.rememberedAt, DATED);
    assert.equal(card.lastUsedAt, DATED);
    assert.equal(card.stalenessDays, 3);
  });
});

test("[memory-card-recency] theme feedback establishes age without inventing a remembered or used date", async () => {
  await withMockedNow(NOW, () => {
    const value = fixture("classifier");
    value.memory.activeThemes[0].qualityLastFeedbackAt = DATED;
    const card = cardFor(value, "classifier");
    assert.equal(card.rememberedAt, 0);
    assert.equal(card.lastUsedAt, 0);
    assert.equal(card.qualityLastFeedbackAt, DATED);
    assert.equal(card.stalenessDays, 3);
    assert.equal(card.stalenessBand, "fresh");
  });
});

test("[memory-card-recency] real history backfill creates undated themes without giving them read-time dates", async () => {
  for (const timestamp of [undefined, 0]) {
    const history = Array.from({ length: 3 }, (_, index) => ({
      id: `anxiety-${index}`, turn: index + 1,
      user: "I feel anxious about my family", assistant: "That uncertainty feels difficult.",
      ...timestamps(["updatedAt"], timestamp),
    }));
    async function backfillAt(nowTs) {
      return withMockedNow(nowTs, () => {
        const memory = createEmptyEmotionMemory();
        memory.turns = history.length;
        const themes = buildBackfilledThemesFromHistory(memory, history, nowTs);
        assert.equal(themes.length, 1, "matching turns must create a real theme");
        const [theme] = themes;
        assert.equal(theme.key, "anxiety_control");
        assert.equal(theme.source, "history_backfill");
        assert.equal(theme.lastMentionedAt, 0);
        assert.equal(theme.lastUsedAt, 0);
        assert.equal(theme.qualityLastFeedbackAt, 0);
        memory.activeThemes = themes;
        const card = buildMemoryCards(memory, history, 24).find((item) => item.source === "history_backfill");
        assert.ok(card, "backfilled theme must reach the actual card builder");
        assertUnknownRecency(card);
        return { themes, card };
      });
    }
    assert.deepEqual(await backfillAt(NOW + DAY), await backfillAt(NOW));
  }
});

test("[memory-card-recency] real history backfill retains latest supplied history date without inventing use or feedback", async () => {
  await withMockedNow(NOW, () => {
    const history = [DATED - 2 * DAY, DATED, DATED - DAY].map((updatedAt, index) => ({
      id: `anxiety-${index}`, turn: index + 1, updatedAt,
      user: "I feel anxious about my family", assistant: "That uncertainty feels difficult.",
    }));
    const memory = createEmptyEmotionMemory();
    memory.turns = history.length;
    const themes = buildBackfilledThemesFromHistory(memory, history, NOW);
    assert.equal(themes.length, 1, "matching dated turns must create a real theme");
    assert.equal(themes[0].lastMentionedAt, DATED);
    assert.equal(themes[0].lastUsedAt, 0);
    assert.equal(themes[0].qualityLastFeedbackAt, 0);
    memory.activeThemes = themes;
    const card = buildMemoryCards(memory, history, 24).find((item) => item.source === "history_backfill");
    assert.ok(card);
    assert.equal(card.rememberedAt, DATED);
    assert.equal(card.lastUsedAt, 0);
    assert.equal(card.qualityLastFeedbackAt, 0);
    assert.equal(card.stalenessDays, 3);
    assert.equal(card.stalenessBand, "fresh");
  });
});

test("[memory-card-recency] unknown display recency preserves supplied future correction audit timestamps", async () => {
  await withMockedNow(NOW, () => {
    const future = NOW + 60 * DAY;
    for (const source of ["canon_correction", "canon_correction_undone", "canon_correction_ambiguous"]) {
      const value = fixture(source, future);
      const original = structuredClone(value.creativeMemory);
      const card = cardFor(value, source);
      assertUnknownRecency(card, source);
      const audit = card.correction_receipt ?? card.correction_ambiguity;
      assert.equal(audit.created_at, future);
      if (source === "canon_correction_undone") assert.equal(audit.undone_at, future);
      assert.deepEqual(value.creativeMemory, original);
    }
  });
});

test("[memory-card-recency] undated cards do not acquire timestamps when read again later", async () => {
  for (const spec of sources) {
    const value = fixture(spec.name);
    const first = await withMockedNow(NOW, () => cardFor(value, spec.name));
    const later = await withMockedNow(NOW + DAY, () => cardFor(value, spec.name));
    assertUnknownRecency(later, spec.name);
    assert.deepEqual(later, first, spec.name);
  }
});

test("[memory-card-recency] real creative ledger reads preserve undated projects and episodes across clocks", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-card-recency-"));
  const persistence = createJsonPersistence({ jsonRoot: root });
  const userId = "writer-undated-recency";
  const stored = {
    userId, version: 1, updatedAt: NOW,
    projects: [{ projectId: "rain-docket", projectTitle: "Rain Docket", currentBeat: "Mara keeps the affidavit." }],
    episodicMemories: [{ id: "episode-undated", summary: "Mara keeps the affidavit.", projectId: "rain-docket" }],
  };
  await persistence.put({ domain: "creative_memory", key: userId, value: stored });
  const store = createCreativeMemoryStore({ persistence });
  async function readAt(nowTs) {
    return withMockedNow(nowTs, async () => {
      const ledger = await store.getCreativeMemoryLedger({ userId, requireValidRecord: true });
      assert.equal(ledger.projects[0].updatedAt, 0);
      assert.equal(ledger.episodicMemories[0].createdAt, 0);
      assert.equal(ledger.episodicMemories[0].updatedAt, 0);
      assert.equal(ledger.episodicMemories[0].lastReferencedAt, 0);
      const cards = buildMemoryCards(createEmptyEmotionMemory(), [], 24, ledger);
      assert.deepEqual(cards.map((card) => card.source).sort(), ["episodic_memory", "screenplay_project"]);
      for (const card of cards) assertUnknownRecency(card, card.source);
      return { ledger, cards, revision: buildCreativeMemoryRevision(ledger) };
    });
  }
  const first = await readAt(NOW);
  const later = await readAt(NOW + DAY);
  assert.deepEqual(later, first);
  assert.deepEqual(await persistence.get({ domain: "creative_memory", key: userId }), stored);
});
