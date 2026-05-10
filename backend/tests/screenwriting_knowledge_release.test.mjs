import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { analyzeScreenplay } from "../lib/craft_analysis.js";
import {
  SCREENWRITING_CRAFT_AREAS,
  buildCraftCardCitations,
  buildFormattingLintWarnings,
  buildGenreDoctorPasses,
  buildReleaseReadinessArtifact,
  buildScreenwritingCraftNoteAnchors,
  filterScreenwritingCards,
  loadKnowledgeCorpus,
} from "../lib/screenwriting_knowledge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND = path.resolve(__dirname, "..");
const CARDS = path.join(BACKEND, "knowledge_cards.json");
const CACHE = path.join(BACKEND, "knowledge_embeddings_cache.json");

test("screenwriting corpus has canonical count, craft coverage, and provenance", () => {
  const corpus = loadKnowledgeCorpus({ cardsFile: CARDS });
  assert.equal(corpus.meta.corpus, "canonical_screenwriting_craft");
  assert.ok(corpus.screenwritingCards.length >= 200);
  assert.ok(corpus.screenwritingCards.length <= 400);
  for (const area of SCREENWRITING_CRAFT_AREAS) {
    assert.ok(corpus.screenwritingCards.some((card) => card.craftArea === area), `missing area ${area}`);
  }
  assert.ok(corpus.screenwritingCards.every((card) => Array.isArray(card.provenance) && card.provenance.length > 0));
});

test("corpus filters by craft area, genre, and text query", () => {
  const dialogueNoir = filterScreenwritingCards({ cardsFile: CARDS, craftArea: "dialogue", genre: "noir", limit: 5 });
  assert.ok(dialogueNoir.cards.length > 0);
  assert.ok(dialogueNoir.cards.every((card) => card.craftArea === "dialogue_economy"));
  assert.ok(dialogueNoir.cards.every((card) => card.genres.includes("noir")));

  const slugline = filterScreenwritingCards({ cardsFile: CARDS, q: "slugline location time", limit: 5 });
  assert.ok(slugline.cards.some((card) => card.craftArea === "sluglines"));
});

test("craft citations expose principle provenance", () => {
  const cards = filterScreenwritingCards({ cardsFile: CARDS, craftArea: "planting_payoff", limit: 2 }).cards;
  const citations = buildCraftCardCitations(cards);
  assert.equal(citations.length, 2);
  assert.ok(citations[0].cardId);
  assert.ok(citations[0].source);
  assert.ok(citations[0].principle);
});

test("page-anchored craft notes and formatting lint cards include card citations", () => {
  const draft = [
    "Int warehouse night",
    "",
    "MARA",
    "I am going to explain all the backstory because as you know we need the audience to understand everything before the scene can move forward, including what happened years ago.",
    "(with a level of sadness and anger that explains her entire childhood wound in detail)",
    "Suddenly, the key opens the door.",
  ].join("\n");
  const notes = buildScreenwritingCraftNoteAnchors({ draft, maxNotes: 8 });
  assert.ok(notes.some((note) => note.craftArea === "sluglines"));
  assert.ok(notes.some((note) => note.craftArea === "exposition"));
  assert.ok(notes.some((note) => note.craftArea === "parentheticals"));
  assert.ok(notes.every((note) => Number.isInteger(note.page) && Number.isInteger(note.lineStart)));

  const warnings = buildFormattingLintWarnings({ draft, format: "fountain" });
  assert.ok(warnings.some((warning) => warning.craftArea === "formatting_fountain"));
});

test("genre doctor passes produce genre-specific passes with citations", () => {
  const passes = buildGenreDoctorPasses({ genre: "thriller", draft: "MIDPOINT reversal\nCLIMAX showdown" });
  assert.equal(passes[0].genre, "thriller");
  assert.ok(passes.every((pass) => Array.isArray(pass.citations)));
});

test("regression fixtures lock expected act, midpoint, all-is-lost, and climax locations", () => {
  const fixtures = JSON.parse(fs.readFileSync(path.join(BACKEND, "evals", "screenwriting_turn_regression_fixtures.json"), "utf8"));
  assert.ok(fixtures.fixtures.length >= 2);
  for (const fixture of fixtures.fixtures) {
    const report = analyzeScreenplay({
      screenplay: { title: fixture.title, pageCount: fixture.pageCount, text: fixture.draft, format: "fountain" },
      frameworkId: fixture.frameworkId,
      projectId: fixture.id,
      versionId: "regression",
      generatedAt: "2026-05-09T00:00:00.000Z",
    });
    for (const expected of fixture.expectedMajorTurns) {
      const actual = report.majorTurns.find((turn) => turn.turnId === expected.turnId);
      assert.ok(actual, `missing ${expected.turnId}`);
      assert.equal(actual.actualPage, expected.actualPage, `${fixture.id} ${expected.turnId}`);
    }
  }
});

test("release readiness artifact proves corpus and optionally enforces embedding freshness", () => {
  const artifact = buildReleaseReadinessArtifact({ cardsFile: CARDS, cacheFile: CACHE });
  assert.equal(artifact.corpus.id, "canonical_screenwriting_craft");
  assert.ok(artifact.corpus.cardCount >= 200 && artifact.corpus.cardCount <= 400);
  assert.equal(artifact.corpus.provenanceOk, true);
  if (process.env.KNOWLEDGE_REQUIRE_SCREENWRITING_EMBED_CACHE === "1") {
    assert.equal(artifact.ready, true, JSON.stringify(artifact.embeddings, null, 2));
    assert.equal(artifact.embeddings.fresh, true);
  }
});
