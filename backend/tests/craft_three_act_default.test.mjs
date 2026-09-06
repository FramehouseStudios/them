import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FRAMEWORK_ID, getFrameworkById } from "../lib/craft_frameworks.js";
import { buildCraftContextBlock } from "../lib/craft_prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("[three-act] is the default framework and carries feature page targets in order", () => {
  assert.equal(DEFAULT_FRAMEWORK_ID, "three-act");
  const fw = getFrameworkById(DEFAULT_FRAMEWORK_ID);
  assert.ok(fw, "three-act framework resolves");
  const byId = Object.fromEntries(fw.beats.map((b) => [b.id, b.expectedPageRange]));
  assert.deepEqual(byId["inciting-incident"], { start: 8, end: 15 });
  assert.deepEqual(byId["first-plot-point"], { start: 20, end: 30 });
  assert.deepEqual(byId["midpoint-twist"], { start: 50, end: 60 });
  assert.deepEqual(byId["second-plot-point"], { start: 70, end: 82 });
  assert.deepEqual(byId["climax"], { start: 95, end: 105 });
  let lastStart = 0;
  for (const beat of fw.beats) {
    assert.ok(beat.expectedPageRange.start >= lastStart, `${beat.id} starts after the previous beat`);
    assert.ok(beat.expectedPageRange.end >= beat.expectedPageRange.start, beat.id);
    lastStart = beat.expectedPageRange.start;
  }
  assert.deepEqual(fw.requiredMajorTurnIds, ["inciting-incident", "midpoint-twist", "climax"]);
  assert.match(fw.summary, /110-page/);
});

test("[three-act] the craft block for the default framework names the required turns with page ranges", () => {
  const block = buildCraftContextBlock({ framework: DEFAULT_FRAMEWORK_ID });
  assert.match(block, /framework: Three-Act Structure \(three-act/);
  assert.match(block, /inciting-incident \(Inciting Incident\) @ p8-15/);
  assert.match(block, /midpoint-twist \(Midpoint Twist\) @ p50-60/);
  assert.match(block, /climax \(Climax\) @ p95-105/);
});

test("[three-act] every default-framework site agrees", () => {
  const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  assert.doesNotMatch(read("index.js"), /requested \|\| "save-the-cat"/);
  assert.match(read("index.js"), /requested \|\| "three-act"/);
  assert.match(read("lib/prompt_routes.js"), /\) \|\| "three-act";/);
  assert.match(read("lib/logline_distiller.js"), /frameworkId \|\| "three-act"/);
  assert.match(read("lib/talk_handler.js"), /\(isScreenplayPageWriteTurn \|\| mentorTurn\)\s*\n\s*\? appendCraftContextToSystem/);
});

test("[craft-cards] twenty craft-principle cards with the shape retrieval expects", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "knowledge_cards.json"), "utf8"));
  const cards = Array.isArray(raw) ? raw : raw.cards;
  const craft = cards.filter((c) => c.topic === "craft");
  assert.equal(craft.length, 20);
  const ids = new Set(cards.map((c) => c.id));
  assert.equal(ids.size, cards.length, "ids are unique across the file");
  for (const c of craft) {
    assert.match(c.id, /^craft_\d{3}$/);
    assert.ok(c.title.length >= 6 && c.title.length <= 140, c.id);
    assert.ok(c.body.length >= 120 && c.body.length <= 420, `${c.id} body ${c.body.length}`);
    assert.ok(Array.isArray(c.tags) && c.tags.length >= 3, c.id);
    assert.equal(c.level, "foundation");
    assert.equal(c.source, "curated");
  }
  const titles = craft.map((c) => c.title.toLowerCase()).join(" | ");
  for (const needed of ["intention and obstacle", "argument", "why now", "midpoint", "on-the-nose", "setups and payoffs", "final image"]) {
    assert.ok(titles.includes(needed), needed);
  }
});
