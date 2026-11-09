import test from "node:test";
import assert from "node:assert/strict";
import { buildShortFilmProject, createShortFilmVersion, ensureShortFilmProject } from "../lib/clementine/short_film_store.js";

function fakeId(prefix) {
  let n = 0;
  return (p = prefix) => `${p || prefix}_${++n}`;
}
function fakeOutline() {
  return { acts: [], scenes: [], beats: [], updatedAt: 0 };
}

test("buildShortFilmProject uses injected outline and id", () => {
  const parsed = { genre: "horror", setting: "bedroom", characters: ["John", "Sally"] };
  const proj = buildShortFilmProject({ parsed, ownerKey: "u1", now: 123, createScreenplayId: fakeId("project"), createEmptyScreenplayOutline: fakeOutline });
  assert.equal(proj.id, "project_1");
  assert.deepEqual(proj.outline, { acts: [], scenes: [], beats: [], updatedAt: 0 });
  assert.equal(proj.tone, "horror");
  assert.equal(proj.setting, "bedroom");
  assert.equal(proj.characters.length, 2);
});

test("createShortFilmVersion via id factory", () => {
  const v = createShortFilmVersion({ draft: "INT. BEDROOM - DAY\nHello", parsed: {}, now: 200, createScreenplayId: fakeId("version") });
  assert.equal(v.id, "version_1");
  assert.equal(v.phase, "beta_short_film_5p");
  assert.equal(v.source, "short_film_beta");
  assert.ok(v.draft.includes("BEDROOM"));
});

test("ensureShortFilmProject id-only: create then find by activeProjectId", () => {
  const owner = { ownerKey: "u1", projects: [], activeProjectId: "" };
  const parsed = { genre: "horror", setting: "bedroom", characters: ["John"] };
  const a = ensureShortFilmProject({ ownerRecord: owner, parsed, now: 1, createScreenplayId: fakeId("project"), createEmptyScreenplayOutline: fakeOutline });
  assert.equal(a.created, true);
  const id = a.project.id;
  assert.equal(owner.activeProjectId, id);
  const b = ensureShortFilmProject({ ownerRecord: owner, parsed, now: 2, createScreenplayId: fakeId("project"), createEmptyScreenplayOutline: fakeOutline });
  assert.equal(b.created, false);
  assert.equal(b.project.id, id);
  assert.equal(owner.projects.length, 1);
});

test("ensureShortFilmProject second brief retains same id even if genre differs (id-only)", () => {
  const owner = { ownerKey: "u1", projects: [], activeProjectId: "" };
  const p1 = { genre: "horror", setting: "bedroom", characters: ["John"] };
  const p2 = { genre: "comedy", setting: "bedroom", characters: ["John"] };
  const first = ensureShortFilmProject({ ownerRecord: owner, parsed: p1, now: 10, createScreenplayId: fakeId("project"), createEmptyScreenplayOutline: fakeOutline });
  const second = ensureShortFilmProject({ ownerRecord: owner, parsed: p2, now: 20, createScreenplayId: fakeId("project"), createEmptyScreenplayOutline: fakeOutline });
  assert.equal(second.created, false);
  assert.equal(second.project.id, first.project.id);
  assert.equal(second.project.tone, "horror"); // not overwritten on reuse
});
