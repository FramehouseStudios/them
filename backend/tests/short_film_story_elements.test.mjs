import test from "node:test";
import assert from "node:assert/strict";
import { buildLogline, buildBeats, attachStoryElements } from "../lib/clementine/short_film_story_elements.js";
import { buildShortFilmProject } from "../lib/clementine/short_film_store.js";

function fakeId(p){ let n=0; return (pre)=>`${pre||p}_${++n}`; }
function fakeOutline(){ return { acts:[], scenes:[], beats:[], updatedAt:0 }; }

test("logline includes title and characters", () => {
  const parsed = { genre:"horror", setting:"bedroom", characters:["John","Sally","Sam"], title:"Orbit Fake", influences:{ tones:["tense"] } };
  const proj = buildShortFilmProject({ parsed, ownerKey:"u1", now:1, createScreenplayId: fakeId("project"), createEmptyScreenplayOutline: fakeOutline });
  const log = buildLogline({ parsed, project: proj });
  assert.ok(log.includes("John"));
  assert.ok(log.includes("Orbit Fake") || log.includes("bedroom"));
});

test("beats 15 pages, synopsis 3 acts", () => {
  const parsed = { genre:"sci-fi", setting:"space station", characters:["Alex","Maya"], totalPages:15, requestedPages:5, influences:{ directors:["Nolan"] } };
  const proj = buildShortFilmProject({ parsed, ownerKey:"u1", now:2, createScreenplayId: fakeId("project"), createEmptyScreenplayOutline: fakeOutline });
  const beats = buildBeats({ parsed, project: proj });
  assert.equal(beats.length, 15);
  assert.equal(beats[0].label, "Opening Image");
  assert.equal(beats[14].label, "Final Image");
});

test("attachStoryElements singular project has logline/synopsis/beats", () => {
  const parsed = { genre:"horror", setting:"bedroom", characters:["John","Sally"], totalPages:15, influences:{} };
  const proj = buildShortFilmProject({ parsed, ownerKey:"u1", now:3, createScreenplayId: fakeId("project"), createEmptyScreenplayOutline: fakeOutline });
  const { logline, synopsis, beats } = attachStoryElements(proj, parsed);
  assert.ok(proj.logline.includes("bedroom"));
  assert.ok(proj.synopsis.includes("Act 1"));
  assert.ok(proj.beats.length >= 5);
  assert.equal(proj.outline.beats.length, proj.beats.length);
  assert.ok(logline && synopsis && beats);
});

test("90-page feature beats span the full script and honor act landmarks", () => {
  const parsed = {
    genre: "thriller",
    setting: "courthouse",
    characters: ["Mara", "Eli"],
    totalPages: 90,
    requestedPages: 5,
    influences: { tones: ["tense"] },
  };
  const beats = buildBeats({ parsed, project: null });
  assert.equal(beats.length, 15);
  assert.equal(beats[0].page, 1);
  assert.equal(beats.find((beat) => beat.label === "Break into Two")?.page, 23);
  assert.equal(beats.find((beat) => beat.label === "Midpoint")?.page, 45);
  assert.equal(beats.find((beat) => beat.label === "Final Image")?.page, 90);
  for (let index = 1; index < beats.length; index += 1) {
    assert.ok(beats[index].page >= beats[index - 1].page);
  }
});
