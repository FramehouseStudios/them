// T-trait-library — unit tests for the pure module and integration
// tests for POST/GET /memory/character-trait[s].

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import {
  extractTraits,
  mergeTraits,
  buildTraitsBlockForPrompt,
  VOCAB_MAX,
  KEYWORD_MAX,
  GOALS_MAX,
  VOICE_TACTICS_MAX,
} from "../lib/trait_library.js";
import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { mountCharacterTraitRoute } from "../lib/character_trait_route.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
// ---------- pure module ----------

test("[trait-library] extractTraits with empty inputs returns the empty trait shape", () => {
  const t = extractTraits({});
  assert.equal(t.vocabulary.length, 0);
  assert.equal(t.keywords.length, 0);
  assert.equal(t.speech_style.pace, "");
  assert.equal(t.emotional_default, "");
});

test("[trait-library] extractTraits captures short repeated phrases as vocabulary", () => {
  const t = extractTraits({
    characterName: "JUNE",
    lines: [
      "I can't do this.",
      "We're not safe here.",
      "I can't do this.",
    ],
  });
  // Dedupes: "I can't do this" appears only once.
  const occurrences = t.vocabulary.filter((v) => v.toLowerCase().includes("can't do this"));
  assert.equal(occurrences.length, 1);
});

test("[trait-library] extractTraits picks up canonical trait keywords from lines", () => {
  const t = extractTraits({
    characterName: "MARCUS",
    lines: ["You're being anxious again.", "The guarded look on his face."],
  });
  assert.ok(t.keywords.includes("anxious"));
  assert.ok(t.keywords.includes("guarded"));
});

test("[trait-library] extractTraits hint keywords always win", () => {
  const t = extractTraits({
    characterName: "JUNE",
    lines: ["Nothing matches."],
    hint: { keywords: ["weary", "tender"] },
  });
  assert.ok(t.keywords.includes("weary"));
  assert.ok(t.keywords.includes("tender"));
});

test("[trait-library] extractTraits infers terse pace from short sentences", () => {
  const t = extractTraits({
    characterName: "CAL",
    lines: ["Yeah.", "No.", "Maybe.", "Not now.", "Fine."],
  });
  assert.equal(t.speech_style.pace, "terse");
  assert.equal(t.speech_style.syntax, "fragmented");
});

test("[trait-library] extractTraits infers ornate pace from long sentences", () => {
  const t = extractTraits({
    characterName: "ELLA",
    lines: [
      "The room was thick with the kind of silence that you only get when somebody has just stopped lying.",
      "I have spent the better part of seven years thinking about what I would say to you if I ever saw you again.",
    ],
  });
  assert.equal(t.speech_style.pace, "ornate");
  // Long sentences → flowing syntax.
  assert.equal(t.speech_style.syntax, "flowing");
});

test("[trait-library] extractTraits infers emotional_default from the strongest keyword", () => {
  const t = extractTraits({
    characterName: "MARCUS",
    lines: ["He's haunted by it."],
  });
  assert.equal(t.emotional_default, "haunted");
});

test("[trait-library] extractTraits respects hint.goals and hint.relationships", () => {
  const t = extractTraits({
    characterName: "JUNE",
    lines: [],
    hint: {
      goals: ["save the diner", "tell the truth"],
      relationships: { MARCUS: "estranged brother", ELLA: "old friend" },
    },
  });
  assert.deepEqual(t.goals, ["save the diner", "tell the truth"]);
  assert.equal(t.relationships.MARCUS, "estranged brother");
  assert.equal(t.relationships.ELLA, "old friend");
});

test("[trait-library] extractTraits builds a durable character voice fingerprint", () => {
  const t = extractTraits({
    characterName: "MARA",
    lines: [
      "No. Not until you sign it.",
      "If I open that door, my sister burns with yours.",
      "Look at the receipt.",
      "The proof stays buried unless you give me the file.",
      "Fine.",
    ],
  });
  assert.ok(t.voice_fingerprint.tactics.includes("refuses first"));
  assert.ok(t.voice_fingerprint.tactics.includes("uses conditional pressure"));
  assert.ok(t.voice_fingerprint.tactics.includes("commands under pressure"));
  assert.ok(t.voice_fingerprint.tactics.includes("weaponizes facts"));
  assert.ok(t.voice_fingerprint.emotional_tells.includes("family pressure slips out"));
  assert.ok(t.voice_fingerprint.emotional_tells.includes("fixates on evidence"));
});

test("[trait-library] mergeTraits is idempotent (merging a value with itself is a no-op beyond ordering)", () => {
  const base = extractTraits({
    characterName: "JUNE",
    lines: ["I can't do this.", "Not now."],
    hint: { keywords: ["anxious"], goals: ["find Marcus"] },
  });
  const merged = mergeTraits(base, base);
  assert.deepEqual(merged.vocabulary.sort(), base.vocabulary.sort());
  assert.deepEqual(merged.keywords.sort(), base.keywords.sort());
  assert.deepEqual(merged.goals.sort(), base.goals.sort());
  assert.equal(merged.emotional_default, base.emotional_default);
});

test("[trait-library] mergeTraits keeps voice fingerprints bounded and accepts camelCase input", () => {
  const base = {
    voiceFingerprint: {
      tactics: Array.from({ length: VOICE_TACTICS_MAX }, (_, index) => `base tactic ${index}`),
      silence: "cuts lines short",
      emotionalTells: ["security language"],
    },
  };
  const next = {
    voice_fingerprint: {
      tactics: ["new tactic"],
      silence: "answers pressure with questions",
      emotional_tells: ["fixates on evidence"],
    },
  };
  const merged = mergeTraits(base, next);
  assert.ok(merged.voice_fingerprint.tactics.length <= VOICE_TACTICS_MAX);
  assert.equal(merged.voice_fingerprint.silence, "answers pressure with questions");
  assert.ok(merged.voice_fingerprint.emotional_tells.includes("security language"));
  assert.ok(merged.voice_fingerprint.emotional_tells.includes("fixates on evidence"));
});

test("[trait-library] mergeTraits respects the documented caps", () => {
  const a = {
    vocabulary: Array.from({ length: VOCAB_MAX }, (_, i) => `phrase ${i}`),
    keywords: Array.from({ length: KEYWORD_MAX }, (_, i) => `kw${i}`),
    goals: Array.from({ length: GOALS_MAX }, (_, i) => `goal-${i}`),
  };
  const b = {
    vocabulary: ["extra phrase A", "extra phrase B"],
    keywords: ["extra-kw"],
    goals: ["extra-goal"],
  };
  const merged = mergeTraits(a, b);
  assert.ok(merged.vocabulary.length <= VOCAB_MAX);
  assert.ok(merged.keywords.length <= KEYWORD_MAX);
  assert.ok(merged.goals.length <= GOALS_MAX);
});

test("[trait-library] mergeTraits favors the newer non-empty speech_style fields", () => {
  const base = { speech_style: { pace: "terse", syntax: "fragmented" } };
  const next = { speech_style: { pace: "ornate", syntax: "" } };
  const merged = mergeTraits(base, next);
  assert.equal(merged.speech_style.pace, "ornate");
  // Empty next.syntax leaves base value intact.
  assert.equal(merged.speech_style.syntax, "fragmented");
});

test("[trait-library] buildTraitsBlockForPrompt produces a compact one-line summary", () => {
  const block = buildTraitsBlockForPrompt({
    vocabulary: ["I can't do this", "Not now"],
    keywords: ["anxious", "tender"],
    speech_style: { pace: "terse", syntax: "fragmented" },
    emotional_default: "anxious",
    goals: ["find Marcus"],
    relationships: { MARCUS: "brother" },
    voice_fingerprint: {
      tactics: ["refuses first", "weaponizes facts"],
      silence: "cuts lines short and lets silence carry threat",
      emotional_tells: ["fixates on evidence"],
    },
  });
  assert.ok(block.includes("emotion: anxious"));
  assert.ok(block.includes("keywords: anxious, tender"));
  assert.ok(block.includes("speech: terse / fragmented"));
  assert.ok(block.includes("voice_fingerprint: tactics=refuses first, weaponizes facts"));
  assert.ok(block.includes("silence=cuts lines short and lets silence carry threat"));
  assert.ok(block.includes("tells=fixates on evidence"));
  assert.ok(block.includes("goals: find Marcus"));
  assert.ok(block.includes("relationships: MARCUS=brother"));
});

// ---------- trigger-side: recordCharacterMention with traits ----------

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-traits-"));
  return createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
}

test("[trait-library] recordCharacterMention persists supplied traits on the character record", async () => {
  const store = freshStore();
  await store.recordCharacterMention({
    userId: "u-trait-1",
    characterName: "JUNE",
    traits: { keywords: ["anxious"], goals: ["find Marcus"] },
  });
  const got = await store.getCharacterTraits({ userId: "u-trait-1", characterName: "JUNE" });
  assert.equal(got.name, "JUNE");
  assert.ok(got.traits.keywords.includes("anxious"));
  assert.ok(got.traits.goals.includes("find Marcus"));
});

test("[trait-library] subsequent recordCharacterMention traits merge with the existing record", async () => {
  const store = freshStore();
  await store.recordCharacterMention({
    userId: "u-trait-2",
    characterName: "JUNE",
    traits: { keywords: ["anxious"] },
  });
  await store.recordCharacterMention({
    userId: "u-trait-2",
    characterName: "JUNE",
    traits: { keywords: ["tender"], goals: ["call mom"] },
  });
  const got = await store.getCharacterTraits({ userId: "u-trait-2", characterName: "JUNE" });
  assert.ok(got.traits.keywords.includes("anxious"));
  assert.ok(got.traits.keywords.includes("tender"));
  assert.ok(got.traits.goals.includes("call mom"));
});

// ---------- endpoint integration ----------

async function withTestServer(fn, { userId = "user-trait" } = {}) {
  const creativeMemoryStore = freshStore();
  const app = express();
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => {
      req.user = { id: userId };
      next();
    });
  }
  mountCharacterTraitRoute(app, { creativeMemoryStore });
  const server = listenEphemeral(app);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL, creativeMemoryStore });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(baseURL, path, body, headers = {}) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, body: json };
}

async function get(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`);
  const json = await r.json().catch(() => null);
  return { status: r.status, body: json };
}

test("[trait-library] POST /memory/character-trait extracts traits from lines and persists", async () => {
  await withTestServer(async ({ baseURL, creativeMemoryStore }) => {
    const { status, body } = await postJson(baseURL, "/memory/character-trait", {
      character_name: "JUNE",
      lines: ["I can't do this.", "Not now."],
      hint: { keywords: ["anxious"], goals: ["find Marcus"] },
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.action, "recorded");
    assert.equal(body.characterName, "JUNE");
    assert.ok(body.traits);
    assert.ok(body.traits.keywords.includes("anxious"));
    assert.ok(body.traits.goals.includes("find Marcus"));
    const persisted = await creativeMemoryStore.getCharacterTraits({
      userId: "user-trait",
      characterName: "JUNE",
    });
    assert.ok(persisted.traits.keywords.includes("anxious"));
  });
});

test("[trait-library] POST /memory/character-trait accepts a pre-extracted traits payload", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/memory/character-trait", {
      characterName: "CAL",
      traits: {
        keywords: ["stoic"],
        speech_style: { pace: "terse", syntax: "declarative" },
        emotional_default: "stoic",
      },
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.traits.speech_style.pace, "terse");
    assert.equal(body.traits.emotional_default, "stoic");
  });
});

test("[trait-library] POST /memory/character-trait rejects when neither lines nor traits is supplied", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/memory/character-trait", {
      character_name: "JUNE",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "no_trait_payload");
  });
});

test("[trait-library] POST /memory/character-trait rejects empty character name", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/memory/character-trait", {
      character_name: "",
      traits: { keywords: ["weary"] },
    });
    assert.equal(status, 400);
    assert.equal(body.error, "invalid_character_name");
  });
});

test("[trait-library] GET /memory/character-traits returns the full library for the user", async () => {
  await withTestServer(async ({ baseURL }) => {
    await postJson(baseURL, "/memory/character-trait", {
      character_name: "JUNE",
      traits: { keywords: ["anxious"] },
    });
    await postJson(baseURL, "/memory/character-trait", {
      character_name: "MARCUS",
      traits: { keywords: ["guarded"] },
    });
    const { status, body } = await get(baseURL, "/memory/character-traits");
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.characters.length, 2);
    const names = body.characters.map((c) => c.name).sort();
    assert.deepEqual(names, ["JUNE", "MARCUS"]);
  });
});

test("[trait-library] GET /memory/character-traits scopes duplicate names to the active project", async () => {
  await withTestServer(async ({ baseURL, creativeMemoryStore }) => {
    await creativeMemoryStore.recordCharacterMention({
      userId: "user-trait",
      characterName: "MARA",
      metadata: { projectId: "rain-docket", projectTitle: "Rain Docket" },
      traits: { goals: ["Expose the forged testimony"] },
    });
    await creativeMemoryStore.recordCharacterMention({
      userId: "user-trait",
      characterName: "MARA",
      metadata: { projectId: "night-train", projectTitle: "Night Train" },
      traits: { goals: ["Stop the train before the border"] },
    });

    const { status, body } = await get(
      baseURL,
      "/memory/character-traits?projectId=rain-docket&projectTitle=Rain%20Docket"
    );

    assert.equal(status, 200);
    assert.equal(body.characters.length, 1);
    assert.equal(body.characters[0].name, "MARA");
    assert.deepEqual(body.characters[0].traits.goals, ["Expose the forged testimony"]);
  });
});

test("[trait-library] GET /memory/character-traits filters to one character when characterName is supplied", async () => {
  await withTestServer(async ({ baseURL }) => {
    await postJson(baseURL, "/memory/character-trait", {
      character_name: "JUNE",
      traits: { keywords: ["anxious"] },
    });
    const { status, body } = await get(baseURL, "/memory/character-traits?characterName=JUNE");
    assert.equal(status, 200);
    assert.equal(body.characters.length, 1);
    assert.equal(body.characters[0].name, "JUNE");
  });
});

test("[trait-library] GET surfaces question provenance and correction status for learned fields", async () => {
  await withTestServer(async ({ baseURL, creativeMemoryStore }) => {
    await creativeMemoryStore.recordTriggersFromTalkTurn({
      userId: "user-trait",
      transcript: "She wants to free Eli from the family lie.",
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      learningContext: {
        questionId: "screenplay-learning-character-want",
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        targetField: "character.want",
        targetLabel: "Mara's dramatic want",
        anchor: "Mara",
        question: "What does Mara want enough to risk the case?",
        authority: "writer_clarification",
      },
    });

    const { status, body } = await get(
      baseURL,
      "/memory/character-traits?projectId=rain-docket&projectTitle=Rain%20Docket"
    );

    assert.equal(status, 200);
    assert.equal(body.characters.length, 1);
    assert.equal(body.characters[0].name, "Mara");
    assert.equal(body.characters[0].bible.character, "Mara");
    assert.equal(body.characters[0].fieldProvenance[0].field, "want");
    assert.equal(body.characters[0].fieldProvenance[0].status, "current");
    assert.equal(
      body.characters[0].fieldProvenance[0].source,
      "screenplay_learning_confirmation"
    );
    assert.equal(
      body.characters[0].fieldProvenance[0].question,
      "What does Mara want enough to risk the case?"
    );
  });
});

test("[trait-library] unauthenticated POST returns 401 and ignores spoofed X-User-Id", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await postJson(
        baseURL,
        "/memory/character-trait",
        {
          character_name: "JUNE",
          traits: { keywords: ["weary"] },
        },
        { "X-User-Id": "spoofed-user" },
      );
      assert.equal(status, 401);
      assert.equal(body.ok, false);
      assert.equal(body.action, "rejected");
      assert.equal(body.error, "user_auth_required");
    },
    { userId: null },
  );
});

test("[trait-library] unauthenticated GET returns 401", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await get(baseURL, "/memory/character-traits");
      assert.equal(status, 401);
      assert.equal(body.error, "user_auth_required");
    },
    { userId: null },
  );
});
