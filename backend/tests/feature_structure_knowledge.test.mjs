import test from "node:test";
import assert from "node:assert/strict";
import { getFeatureBeats } from "../lib/clementine/feature_structure_knowledge.js";

test("getFeatureBeats wraps three-act beats with 90p default splits 25/50/25", () => {
  const s = getFeatureBeats({ genre: "thriller", tone: "tense", mood: "paranoia" });
  assert.equal(s.totalPages, 90);
  assert.equal(s.acts.length, 3);
  assert.equal(s.acts[0].pages, 23); // Math.round(90*0.25)=23
  assert.equal(s.acts[1].pages, 45); // Math.round(90*0.5)=45
  assert.equal(s.acts[2].pages, 22); // remainder 90-23-45=22
  assert.equal(s.acts[0].pages + s.acts[1].pages + s.acts[2].pages, 90);
  assert.ok(s.acts[0].beats.length > 0);
});

test("getFeatureBeats supports totalPages 15-90 with proportional splits", () => {
  const s60 = getFeatureBeats({ genre: "drama", tone: "grounded", mood: "grief", totalPages: 60 });
  assert.equal(s60.totalPages, 60);
  assert.equal(s60.acts[0].pages, 15);
  assert.equal(s60.acts[1].pages, 30);
  assert.equal(s60.acts[2].pages, 15);
  assert.equal(s60.acts[0].pages + s60.acts[1].pages + s60.acts[2].pages, 60);

  const s15 = getFeatureBeats({ genre: "comedy", totalPages: 15 });
  assert.equal(s15.totalPages, 15);
  assert.equal(s15.acts[0].pages, 4); // round(3.75)
  assert.equal(s15.acts[1].pages, 8); // round(7.5)
  assert.equal(s15.acts[2].pages, 3); // remainder
  assert.equal(s15.acts[0].pages + s15.acts[1].pages + s15.acts[2].pages, 15);

  const sClampedLow = getFeatureBeats({ genre: "horror", totalPages: 5 });
  assert.equal(sClampedLow.totalPages, 15);

  const sClampedHigh = getFeatureBeats({ genre: "horror", totalPages: 200 });
  assert.equal(sClampedHigh.totalPages, 90);
});

test("getFeatureBeats preserves genre/tone/mood wrapping via getThreeActBeats", () => {
  const s = getFeatureBeats({ genre: "sci-fi", tone: "dark", mood: "awe", totalPages: 80 });
  assert.equal(s.genre, "sci-fi");
  assert.ok(s.acts[0].beats[0].includes("world rule") || s.acts[0].beats.join(" ").includes("world"));
  assert.ok(s.voiceHints.includes("dark") || s.voiceHints.includes("clipped"));
  assert.ok(s.imageEcho.includes("awe") || s.moodHint);
  assert.equal(s.totalPages, 80);
  assert.equal(s.acts[0].pages + s.acts[1].pages + s.acts[2].pages, 80);
  assert.equal(s.acts[0].pages, 20); // round(80*0.25)
  assert.equal(s.acts[1].pages, 40); // round(80*0.5)
  assert.equal(s.acts[2].pages, 20);
});
