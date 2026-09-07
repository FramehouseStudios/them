import test from "node:test";
import assert from "node:assert/strict";
import { buildCharacterContexts, ensureCharacterContexts, pushCharacterMemory, getCharacterContext } from "../lib/clementine/short_film_character_context.js";
import { buildShortFilmProject } from "../lib/clementine/short_film_store.js";

function fakeId(p) { let n=0; return (pre)=>`${pre||p}_${++n}`; }
function fakeOutline(){ return { acts:[], scenes:[], beats:[], updatedAt:0 }; }

test("buildCharacterContexts per-character distinct voice/backstory", () => {
  const ctxs = buildCharacterContexts({ characters: ["John","Sally","Sam"], genre:"horror", setting:"bedroom" });
  assert.equal(ctxs.length, 3);
  assert.notEqual(ctxs[0].voice, ctxs[1].voice);
  assert.ok(ctxs[0].memory.length === 0);
  assert.ok(ctxs[0].backstory.includes("bedroom"));
});

test("ensureCharacterContexts id-only by name keeps memory", () => {
  const parsed = { genre:"horror", setting:"bedroom", characters:["John","Sally"], influences:{} };
  const proj = buildShortFilmProject({ parsed, ownerKey:"u1", now:1, createScreenplayId: fakeId("project"), createEmptyScreenplayOutline: fakeOutline });
  ensureCharacterContexts(proj, parsed);
  assert.equal(proj.characterContexts.length, 2);
  pushCharacterMemory(proj, { name:"John", text:"We shouldn't have stayed.", page:1 });
  assert.equal(getCharacterContext(proj,"John").memory.length, 1);
  // second ensure with same names retains memory
  ensureCharacterContexts(proj, parsed);
  assert.equal(getCharacterContext(proj,"John").memory.length, 1);
  assert.equal(proj.characterContexts.length, 2);
});

test("singular project, multiple characters each has isolated memory", () => {
  const parsed = { genre:"sci-fi", setting:"space station", characters:["Alex","Maya"], influences:{ directors:["Nolan"] } };
  const proj = buildShortFilmProject({ parsed, ownerKey:"u1", now:2, createScreenplayId: fakeId("project"), createEmptyScreenplayOutline: fakeOutline });
  ensureCharacterContexts(proj, parsed);
  pushCharacterMemory(proj, { name:"Alex", text:"Fake set is real.", page:1 });
  pushCharacterMemory(proj, { name:"Maya", text:"Chasing before midnight.", page:1 });
  assert.equal(getCharacterContext(proj,"Alex").memory[0].text, "Fake set is real.");
  assert.equal(getCharacterContext(proj,"Maya").memory[0].text, "Chasing before midnight.");
  assert.notEqual(getCharacterContext(proj,"Alex").memory[0].text, getCharacterContext(proj,"Maya").memory[0].text);
});

test("memory caps at 6", () => {
  const proj = { characterContexts: buildCharacterContexts({ characters:["John"], genre:"horror", setting:"bedroom"}) };
  for(let i=0;i<10;i++) pushCharacterMemory(proj,{name:"John", text:`line ${i}`, page:1});
  assert.equal(getCharacterContext(proj,"John").memory.length, 6);
  assert.equal(getCharacterContext(proj,"John").memory[0].text, "line 4");
});
