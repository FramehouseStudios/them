import test from "node:test";
import assert from "node:assert/strict";
import { persistCharacterMemory, persistCharacterContexts, createMemoryPersister } from "../lib/clementine/memory_persist.js";
import { buildCharacterContexts } from "../lib/clementine/short_film_character_context.js";

function fakeCommitFactory(store) {
  return async ({ ownerKey, mutate }) => {
    let owner = store[ownerKey];
    if (!owner) { owner = { ownerKey, projects: [], activeProjectId: "", updatedAt: Date.now() }; store[ownerKey]=owner; }
    const res = await mutate(owner);
    if (res?.commit === false) return { ok: false, committed: false, reason: res.reason };
    return { ok: true, committed: true, ownerKey };
  };
}

test("memory_persist: persistCharacterMemory pushes via commit", async () => {
  const store = {};
  const commit = fakeCommitFactory(store);
  const ownerKey = "user1";
  // seed project with contexts
  await commit({ ownerKey, mutate: (o) => { o.projects.push({ id: "p1", title: "Test", characters: [{name:"John"},{name:"Sally"}], characterContexts: buildCharacterContexts({characters:["John","Sally"], genre:"horror", setting:"bedroom"}), updatedAt: Date.now() }); o.activeProjectId="p1"; return {commit:true}; }});
  const r = await persistCharacterMemory({ ownerKey, name: "John", text: "I saw the door move", page: 1, commitScreenplayOwnerMutation: commit });
  assert.equal(r.ok, true);
  const proj = store[ownerKey].projects[0];
  const ctx = proj.characterContexts.find((c)=>c.name==="John");
  assert.ok(ctx.memory.length===1);
  assert.match(ctx.memory[0].text, /door move/);
});

test("memory_persist: createMemoryPersister wrapper", async () => {
  const store = {};
  const commit = fakeCommitFactory(store);
  await commit({ ownerKey: "u2", mutate: (o)=>{ o.projects.push({id:"p2", title:"T", characters:[{name:"Sam"}], characterContexts: buildCharacterContexts({characters:["Sam"], genre:"horror", setting:"bedroom"}), updatedAt: Date.now()}); o.activeProjectId="p2"; return {commit:true}; }});
  const p = createMemoryPersister({ commitScreenplayOwnerMutation: commit });
  const r = await p.persistCharacterMemory({ ownerKey:"u2", name:"Sam", text:"hello", page:2 });
  assert.equal(r.ok, true);
  assert.equal(store["u2"].projects[0].characterContexts[0].memory[0].page, 2);
});

test("memory_persist: caps memory at 6", async () => {
  const store = {};
  const commit = fakeCommitFactory(store);
  await commit({ ownerKey:"u3", mutate:(o)=>{ o.projects.push({id:"p3", title:"T", characters:[{name:"Ada"}], characterContexts: buildCharacterContexts({characters:["Ada"], genre:"horror", setting:"bedroom"}), updatedAt:Date.now()}); o.activeProjectId="p3"; return {commit:true}; }});
  for(let i=0;i<8;i++) await persistCharacterMemory({ ownerKey:"u3", name:"Ada", text:`line ${i}`, commitScreenplayOwnerMutation: commit });
  assert.equal(store["u3"].projects[0].characterContexts[0].memory.length, 6);
  assert.equal(store["u3"].projects[0].characterContexts[0].memory[0].text, "line 2");
});

test("mentor golden 40 stub: golden passes weak fails", async () => {
  const { loadCases, scoreMentorGoldenReply } = await import("../evals/clementine/score_mentor_golden.js");
  const cases = loadCases(new URL("../evals/clementine/mentor_golden_40.jsonl", import.meta.url).pathname);
  assert.equal(cases.length, 40);
  for (const c of cases) {
    const g = scoreMentorGoldenReply(c.golden, c);
    const w = scoreMentorGoldenReply(c.weak, c);
    assert.equal(g.verdict, "PASS", `golden should PASS ${c.id}`);
    assert.equal(w.verdict, "FAIL", `weak should FAIL ${c.id}`);
  }
});
