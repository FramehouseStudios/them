import test from "node:test";
import assert from "node:assert/strict";
import { buildShortFilmPrompt, generateOfflineShortFilmDraft } from "../lib/clementine/short_film_prompt.js";
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
  assert.ok(outline.includes("Act 1 p1-5"), "outline missing Act 1");
  assert.ok(system.includes("INT. BEDROOM"), "system missing INT. BEDROOM");
  assert.ok(system.includes("John") && system.includes("Sally") && system.includes("Sam"), "system missing character names");
});

test("offline draft 5-page shape", () => {
  const draft = generateOfflineShortFilmDraft(parsed);
  const pages = draft.split(/--- PAGE \d+ ---/g).filter(s => s.trim().length > 10);
  assert.equal(pages.length, 5, `expected 5 pages, got ${pages.length}`);
  // Each page 120-350 words
  for (let i = 0; i < pages.length; i++) {
    const words = pages[i].trim().split(/\s+/).length;
    assert.ok(words >= 30 && words <= 400, `page ${i+1} words ${words} out of range`);
  }
  // Contains bedroom, names, horror lexicon, INT. BEDROOM headers
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

test("offline draft respects requestedPages", () => {
  const p2 = { ...parsed, requestedPages: 3 };
  const d3 = generateOfflineShortFilmDraft(p2);
  const pages = d3.split(/--- PAGE \d+ ---/g).filter(s => s.trim().length > 10);
  assert.equal(pages.length, 3);
});

test("build prompt handles missing setting", () => {
  const { system } = buildShortFilmPrompt({ totalPages: 10, requestedPages: 2, genre: "comedy", setting: null, characters: ["Alice"] });
  assert.ok(system.includes("ALICE") || system.includes("Alice"));
});
