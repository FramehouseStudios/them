import test from "node:test";
import assert from "node:assert/strict";
import { buildShortFilmPrompt, generateOfflineShortFilmDraft } from "../lib/clementine/short_film_prompt.js";
import { resolveShortFilmCraftContext } from "../lib/clementine/short_film_craft_context.js";
import fs from "node:fs";
import path from "node:path";

const fixturePath = new URL("../lib/clementine/prompt_golden_fixtures/short_film_horror_bedroom_5p.json", import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const parsed = fixture.parsed;

test("golden: parsed → prompt contains required scaffold", () => {
  const { system, user, outline } = buildShortFilmPrompt(parsed);
  for (const s of fixture.expect.systemContains) {
    assert.ok(system.includes(s), `system missing "${s}"`);
  }
  for (const s of fixture.expect.userContains) {
    assert.ok(user.includes(s), `user missing "${s}"`);
  }
  assert.ok(outline.includes("Act 1"), "outline missing Act 1");
  assert.ok(system.includes("INT. BEDROOM"), "system missing INT. BEDROOM");
  assert.ok(system.includes("John") && system.includes("Sally") && system.includes("Sam"), "system missing character names");
  assert.ok(system.includes("plain Fountain"), "system should mention plain Fountain");
});

test("offline draft 5-page shape (plain Fountain, no markers)", () => {
  const draft = generateOfflineShortFilmDraft(parsed);
  // Plain Fountain: count INT. headers as pages (no "--- PAGE n ---")
  const pages = (draft.match(/INT\. BEDROOM/gi) || []);
  assert.equal(pages.length, 5, `expected 5 pages (INT. BEDROOM), got ${pages.length}`);
  assert.ok(!draft.includes("--- PAGE"), "draft should not contain PAGE markers — plain Fountain");
  // Split by INT. for word count per page
  const splits = draft.split(/INT\. BEDROOM/gi).filter(s => s.trim().length > 10);
  assert.equal(splits.length, 5);
  for (let i = 0; i < splits.length; i++) {
    const words = splits[i].trim().split(/\s+/).length;
    assert.ok(words >= 10 && words <= 400, `page ${i+1} words ${words} out of range`);
  }
  // Contains bedroom, names, horror lexicon
  assert.ok(draft.includes("INT. BEDROOM"), "missing INT. BEDROOM header");
  const lower = draft.toLowerCase();
  assert.ok((lower.match(/bedroom/g) || []).length >= 3, "bedroom <3");
  for (const name of parsed.characters) {
    const count = (draft.match(new RegExp(name, "gi")) || []).length;
    assert.ok(count >= 2, `${name} appears ${count} <2`);
  }
  const horrorHits = ["dark","blood","shadow","whisper","fear","night"].filter(w => lower.includes(w)).length;
  assert.ok(horrorHits >= 2, `horror lexicon hits ${horrorHits} <2`);
});

test("offline draft respects requestedPages (plain Fountain)", () => {
  const p2 = { ...parsed, requestedPages: 3 };
  const d3 = generateOfflineShortFilmDraft(p2);
  const pages = (d3.match(/INT\. BEDROOM/gi) || []);
  assert.equal(pages.length, 3);
  assert.ok(!d3.includes("--- PAGE"));
});

test("build prompt handles missing setting", () => {
  const { system } = buildShortFilmPrompt({ totalPages: 10, requestedPages: 2, genre: "comedy", setting: null, characters: ["Alice"] });
  assert.ok(system.includes("ALICE") || system.includes("Alice"));
});

test("craft context is explicit, length-aware, and cache-sensitive", () => {
  const generic = resolveShortFilmCraftContext({
    totalPages: 5,
    genre: "horror",
    influences: { tones: [] },
  });
  assert.equal(generic.block, "", "generic horror with no tone must not inject a craft card");
  assert.equal(generic.cacheKey, "craft:none");

  const short = resolveShortFilmCraftContext({
    totalPages: 5,
    genre: "horror",
    influences: { tones: ["tense"] },
  });
  const feature = resolveShortFilmCraftContext({
    totalPages: 90,
    genre: "horror",
    influences: { tones: ["tense"] },
  });
  const melancholy = resolveShortFilmCraftContext({
    totalPages: 5,
    genre: "horror",
    influences: { tones: ["melancholic"] },
  });
  assert.equal(short.cards.length, 1);
  assert.equal(feature.cards.length, 2);
  assert.notEqual(short.cacheKey, feature.cacheKey);
  assert.notEqual(short.cacheKey, melancholy.cacheKey);
});

test("90-page prompt carries the feature act split", () => {
  const { system } = buildShortFilmPrompt({
    totalPages: 90,
    requestedPages: 5,
    genre: "thriller",
    setting: "courthouse",
    characters: ["Mara", "Eli"],
    influences: { tones: ["tense"] },
  });
  assert.match(system, /Feature act splits: Act1 23p \/ Act2 45p \/ Act3 22p\./);
});
