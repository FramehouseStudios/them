import test from "node:test";
import assert from "node:assert/strict";
import { closestGenre, getThreeActBeats } from "../lib/clementine/story_structure_knowledge.js";

test("closestGenre open vocab folk horror → horror", () => {
  assert.equal(closestGenre("folk horror"), "horror");
  assert.equal(closestGenre("solarpunk"), "drama");
});

test("getThreeActBeats sci-fi + tense", () => {
  const s = getThreeActBeats({ genre:"sci-fi", tone:"tense", mood:"dread", influences:{ directors:["Nolan"] } });
  assert.equal(s.genre, "sci-fi");
  assert.ok(s.acts[0].beats[0].includes("world rule"));
  assert.ok(s.voiceHints.includes("staccato"));
  assert.ok(s.directorHint.includes("Nolan"));
});

test("romance uplifting has romance beats", () => {
  const s = getThreeActBeats({ genre:"romance", tone:"uplifting", mood:"longing" });
  assert.ok(s.acts[1].beats.join(" ").includes("kiss") || s.acts[1].beats.join(" ").includes("obstacle"));
  assert.equal(s.genre, "romance");
});

test("fallback unknown genre still returns 3 acts", () => {
  const s = getThreeActBeats({ genre:"unknown-xyz", tone:"dark" });
  assert.equal(s.acts.length, 3);
  assert.equal(s.genre, "drama");
});
