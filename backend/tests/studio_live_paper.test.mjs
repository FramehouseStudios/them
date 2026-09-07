import assert from "node:assert/strict";
import { buildLivePaperPayload } from "../lib/clementine/studio_live_paper.js";

const sample = {
  logline: "  A stunt double discovers the film is real  ",
  synopsis: "  When the set never wraps, she must choose reality.  ",
  beats: [
    { id: "b1", title: "Inciting", order: 1 },
    { id: "b1", title: "Inciting", order: 1 }, // dup should dedupe
    { title: "Midpoint", summary: "Truth flips" },
  ],
  characterContexts: { Jax: " haunted lead ", "": "ignore", Mia: "  medic  " }
};

const out = buildLivePaperPayload(sample);
assert.equal(out.logline, "A stunt double discovers the film is real");
assert.equal(out.synopsis, "When the set never wraps, she must choose reality.");
assert.equal(out.beats.length, 2);
assert.equal(out.beats[0].id, "b1");
assert.equal(out.characterContexts.Jax, "haunted lead");
assert.equal(out.characterContexts.Mia, "medic");
assert.equal(out.characterContexts[""], undefined);

// empty / null input
const empty = buildLivePaperPayload(null);
assert.equal(empty.logline, "");
assert.deepEqual(empty.beats, []);
assert.deepEqual(empty.characterContexts, {});

// snake_case + screenplayLogline fallback
const alt = buildLivePaperPayload({ screenplayLogline: " alt log ", beats: ["beat one"], character_contexts: { A: " ctx " } });
assert.equal(alt.logline, "alt log");
assert.equal(alt.beats.length, 1);
assert.equal(alt.characterContexts.A, "ctx");

console.log("studio_live_paper tests passed");
