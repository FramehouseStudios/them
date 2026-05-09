import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCharacterVoiceAddendum,
  buildCharacterVoicePromptBlock,
  extractCharacterVoiceCards,
  mergeCharacterVoiceCard,
  normalizeCharacterVoiceCard,
  normalizeCharacterVoiceCardCollection,
  scoreCharacterVoiceDrift,
} from "../services/character_voice_runtime.js";
import { createTalkPromptContextServices } from "../services/talk_prompt_context.js";

const SCREENPLAY = `INT. MOTEL ROOM - NIGHT

Alice paces. Bob watches.

ALICE
I don't know what we're doing here.
I really don't.

BOB
Well, look, I told you. We wait.

ALICE
For what? For who?
You never say.

BOB
Well, you never ask. Not really.

INT. PARKING LOT - LATER

ALICE (V.O.)
I always ask. I just don't get answers.

BOB
Look, I'll tell you when it matters.

ALICE
It matters now.
`;

test("extractCharacterVoiceCards groups dialogue by cue and computes cadence", () => {
  const cards = extractCharacterVoiceCards(SCREENPLAY, { minLines: 2 });
  assert.equal(cards.length, 2, "should detect ALICE and BOB");
  const alice = cards.find((card) => card.name === "ALICE");
  const bob = cards.find((card) => card.name === "BOB");
  assert.ok(alice, "ALICE card present");
  assert.ok(bob, "BOB card present");

  // ALICE has 6 dialogue lines (V.O. cue is stripped, so they merge).
  assert.equal(alice.lineCount, 6);
  assert.ok(alice.cadence.avgWordsPerLine > 0);
  assert.ok(alice.cadence.questionRatio > 0, "ALICE asks questions");
  assert.equal(alice.cadence.profanityRatio, 0, "ALICE never swears in this sample");
  assert.ok(alice.sampleLines.length >= 2);

  // BOB opens lines with 'well,' / 'look,' — both are vocal-tic patterns.
  const bobTicIds = bob.vocalTics.map((tic) => tic.id);
  assert.ok(bobTicIds.includes("filler_well") || bobTicIds.includes("filler_look"));
});

test("extractCharacterVoiceCards respects minLines filter", () => {
  const onlyChatty = extractCharacterVoiceCards(SCREENPLAY, { minLines: 5 });
  assert.equal(onlyChatty.length, 1);
  assert.equal(onlyChatty[0].name, "ALICE");
});

test("normalizeCharacterVoiceCard enforces schema and clamps ratios", () => {
  const card = normalizeCharacterVoiceCard({
    name: "  Alice  ",
    aliases: ["A", "A", "Allie"],
    role: "Protagonist",
    lineCount: -3,
    cadence: {
      avgWordsPerLine: 7,
      fragmentRatio: 5, // out of range, must clamp to 1
      contractionRatio: -1, // must clamp to 0
      profanityRatio: 0,
      exclamationRatio: 0.2,
      questionRatio: 0.3,
    },
    vocabFingerprint: {
      totalWords: 42,
      uniqueWords: 31,
      signaturePhrases: ["really really", "i guess"],
      avoidedWords: ["literally"],
    },
    vocalTics: [
      { id: "ellipsis", label: "trails off (...)", count: 4 },
      { id: "", label: "drop me", count: 1 },
    ],
    sampleLines: ["I don't know what we're doing here.", "I don't know what we're doing here."],
    wants: "to be heard",
    fears: "abandonment",
    secret: "she's been lying about the trip",
    contradictions: ["claims independence; orbits Bob"],
    notes: "v1 mechanical extraction",
    source: "merged",
  });

  assert.equal(card.name, "Alice");
  assert.equal(card.lineCount, 0, "negative line count clamped to 0");
  assert.equal(card.cadence.fragmentRatio, 1, "out-of-range ratio clamped to 1");
  assert.equal(card.cadence.contractionRatio, 0, "negative ratio clamped to 0");
  assert.deepEqual(card.aliases, ["A", "Allie"], "duplicate aliases deduped");
  assert.deepEqual(card.sampleLines.length, 1, "duplicate sample lines deduped");
  assert.equal(card.vocalTics.length, 1, "tic with empty id dropped");
  assert.equal(card.source, "merged");
});

test("normalizeCharacterVoiceCardCollection drops invalid entries and keys by slot", () => {
  const cards = normalizeCharacterVoiceCardCollection({
    ALICE: { name: "ALICE", lineCount: 3 },
    "": { name: "BOB", lineCount: 2 }, // empty key + valid name — slot becomes "BOB" via name fallback? No, slot resolves to ""
    BOB: { name: "BOB", lineCount: 2 },
    BAD: { name: "" }, // invalid — no name
  });
  assert.ok(cards.ALICE, "ALICE preserved");
  assert.ok(cards.BOB, "BOB preserved");
  assert.equal(cards.BAD, undefined, "nameless card dropped");
});

test("buildCharacterVoicePromptBlock renders cadence cues and signature phrases", () => {
  const cards = extractCharacterVoiceCards(SCREENPLAY, { minLines: 2 });
  const alice = cards.find((card) => card.name === "ALICE");
  const block = buildCharacterVoicePromptBlock(alice);
  assert.match(block, /CHARACTER VOICE — ALICE/);
  assert.match(block, /Cadence:/);
  assert.match(block, /Sample lines:/);
  assert.match(block, /Stay inside this voice/);
});

test("buildCharacterVoicePromptBlock returns empty string for invalid input", () => {
  assert.equal(buildCharacterVoicePromptBlock(null), "");
  assert.equal(buildCharacterVoicePromptBlock({}), "");
  assert.equal(buildCharacterVoicePromptBlock({ name: "" }), "");
});

test("buildCharacterVoiceAddendum joins multiple cards with a blank line", () => {
  const cards = extractCharacterVoiceCards(SCREENPLAY, { minLines: 2 });
  const addendum = buildCharacterVoiceAddendum(cards);
  assert.match(addendum, /CHARACTER VOICE — ALICE/);
  assert.match(addendum, /CHARACTER VOICE — BOB/);
  assert.ok(addendum.split("\n\n").length >= 2);
});

test("mergeCharacterVoiceCard preserves manual fields when stats refresh", () => {
  const fresh = {
    name: "ALICE",
    lineCount: 12,
    cadence: { avgWordsPerLine: 9 },
    vocabFingerprint: { totalWords: 90, uniqueWords: 60 },
    source: "deterministic",
  };
  const existing = {
    name: "ALICE",
    lineCount: 6,
    wants: "to be heard",
    fears: "abandonment",
    secret: "she's been lying",
    contradictions: ["claims independence; orbits Bob"],
    notes: "set by writer",
    role: "Protagonist",
    source: "manual",
  };
  const merged = mergeCharacterVoiceCard(existing, fresh);
  assert.equal(merged.lineCount, 12, "fresh stats applied");
  assert.equal(merged.wants, "to be heard");
  assert.equal(merged.fears, "abandonment");
  assert.equal(merged.role, "Protagonist");
  assert.equal(merged.source, "merged");
});

test("scoreCharacterVoiceDrift flags cadence and profanity drift", () => {
  const cards = extractCharacterVoiceCards(SCREENPLAY, { minLines: 2 });
  const alice = cards.find((card) => card.name === "ALICE");
  // ALICE never swears and asks short questions. Feed it a long, explicit
  // single line and we should trip several flags at once.
  const drift = scoreCharacterVoiceDrift(alice, [
    "Look, I have absolutely had it with this entire goddamn fucking situation, and I am leaving immediately.",
  ]);
  assert.equal(drift.compared, true);
  assert.ok(drift.flags.length >= 1, `expected drift flags, got ${JSON.stringify(drift.flags)}`);
  assert.ok(drift.score > 0);
});

test("scoreCharacterVoiceDrift returns clean score for in-voice lines", () => {
  const cards = extractCharacterVoiceCards(SCREENPLAY, { minLines: 2 });
  const alice = cards.find((card) => card.name === "ALICE");
  const drift = scoreCharacterVoiceDrift(alice, [
    "I don't know.",
    "Why won't you say?",
  ]);
  assert.equal(drift.compared, true);
  assert.deepEqual(drift.flags, []);
  assert.equal(drift.score, 0);
});

test("scoreCharacterVoiceDrift handles missing card or empty input gracefully", () => {
  assert.equal(scoreCharacterVoiceDrift(null, ["anything"]).compared, false);
  assert.equal(scoreCharacterVoiceDrift({ name: "X" }, []).compared, false);
});

test("talk_prompt_context appends characterVoiceAddendum into the system prompt chain", () => {
  const calls = [];
  const services = createTalkPromptContextServices({
    appendDirectorAddendum: (system, addendum) => {
      const next = addendum ? `${system}\n\n${addendum}` : system;
      calls.push({ addendum, length: next.length });
      return next;
    },
    fitSystemPromptForTurnLatency: (text) => text,
  });
  const characterVoiceAddendum = "CHARACTER VOICE — ALICE\nCadence: avg ~6 words/line.";
  const { system } = services.buildTalkPromptSystem({
    systemBase: "BASE",
    characterTextureAddendum: "TEXTURE",
    characterVoiceAddendum,
  });
  assert.match(system, /BASE/);
  assert.match(system, /TEXTURE/);
  assert.match(system, /CHARACTER VOICE — ALICE/);
  // Texture must come before character voice so per-character overrides apply last.
  assert.ok(system.indexOf("TEXTURE") < system.indexOf("CHARACTER VOICE — ALICE"));
});
