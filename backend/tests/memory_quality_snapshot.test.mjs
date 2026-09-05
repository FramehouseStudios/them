import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeSnippet } from "../lib/utils.js";

// Exercise the private snapshot builder without booting the backend or adding a public export.
const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const start = source.indexOf("function buildMemoryQualitySnapshot(");
const end = source.indexOf("\nfunction resolveThemeKeyFromMemoryCard(", start);
assert.ok(start >= 0 && end > start, "the snapshot builder must be present");
const buildMemoryQualitySnapshot = new Function(
  "sanitizeActiveThemes",
  "normalizeSnippet",
  "MEMORY_QUALITY_STALE_DAYS",
  `${source.slice(start, end)}\nreturn buildMemoryQualitySnapshot;`,
)(
  (themes) => Array.isArray(themes) ? themes : [],
  normalizeSnippet,
  21,
);

const nowTs = 1_800_000_000_000;

test("memory quality snapshot preserves a valid zero estimate", () => {
  const snapshot = buildMemoryQualitySnapshot({}, [{ qualityScore: 0 }], nowTs);

  assert.equal(snapshot.avg_quality_score, 0);
  assert.equal(snapshot.total_cards, 1);
  assert.equal(snapshot.scored_cards, 1);
  assert.equal(snapshot.unknown_quality_cards, 0);
});

test("memory quality snapshot excludes absent, nonnumeric, nonfinite, and out-of-range scores", () => {
  const cards = [
    {},
    null,
    ...[null, undefined, "", "0", false, NaN, Infinity, -Infinity, -0.01, 1.01]
      .map((qualityScore) => ({ qualityScore })),
  ];
  const snapshot = buildMemoryQualitySnapshot({}, cards, nowTs);

  assert.equal(snapshot.avg_quality_score, 0);
  assert.equal(snapshot.total_cards, 12);
  assert.equal(snapshot.scored_cards, 0);
  assert.equal(snapshot.unknown_quality_cards, 12);
});

test("memory quality snapshot averages only scored cards in a mixed response", () => {
  const snapshot = buildMemoryQualitySnapshot({}, [
    { qualityScore: 0 },
    { qualityScore: 1 },
    { qualityScore: 0.5 },
    {},
    { qualityScore: null },
    { qualityScore: 2 },
  ], nowTs);

  assert.equal(snapshot.avg_quality_score, 0.5);
  assert.equal(snapshot.total_cards, 6);
  assert.equal(snapshot.scored_cards, 3);
  assert.equal(snapshot.unknown_quality_cards, 3);
});

test("memory quality snapshot returns explicit zero coverage for an empty response", () => {
  for (const cards of [[], null]) {
    const snapshot = buildMemoryQualitySnapshot({}, cards, nowTs);
    for (const key of [
      "avg_quality_score", "total_cards", "scored_cards", "unknown_quality_cards",
      "fresh_cards", "warm_cards", "stale_cards", "unknown_staleness_cards",
    ]) {
      assert.equal(snapshot[key], 0, key);
    }
    assert.equal(snapshot.generated_at, nowTs);
  }
});

test("memory quality snapshot never counts unknown staleness as fresh", () => {
  const snapshot = buildMemoryQualitySnapshot({}, [
    { stalenessBand: "fresh" },
    { stalenessBand: " WARM " },
    { stalenessBand: "stale" },
    {},
    { stalenessBand: null },
    { stalenessBand: "" },
    { stalenessBand: "unknown" },
    { stalenessBand: 0 },
    { stalenessBand: { toString: () => "fresh" } },
  ], nowTs);

  assert.equal(snapshot.total_cards, 9);
  assert.equal(snapshot.fresh_cards, 1);
  assert.equal(snapshot.warm_cards, 1);
  assert.equal(snapshot.stale_cards, 1);
  assert.equal(snapshot.unknown_staleness_cards, 6);
});
