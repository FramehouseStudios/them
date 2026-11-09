import test from "node:test";
import assert from "node:assert/strict";
import { resolveShortFilmIntent, autonomousNames } from "../lib/clementine/short_film_intent_llm.js";

test("resolve via heuristic when complete", async () => {
  const u = "Hey Clementine, I want to write a short film today 15 pages, genre will be horror film, one location, in a bedroom, three characters, one John, one Sally, one Sam. Write the first five pages.";
  const r = await resolveShortFilmIntent(u);
  assert.equal(r.genre, "horror");
  assert.deepEqual(r.characters, ["John", "Sally", "Sam"]);
});

test("autonomous 5 characters when unknown names", async () => {
  const u = "Hey Clementine, I want to write a short film today sci-fi like Christopher Nolan in space, genre sci-fi, 15 pages, five characters I don't know their names, one location space station, write first page.";
  const r = await resolveShortFilmIntent(u);
  assert.equal(r.genre, "sci-fi");
  assert.equal(r.characters.length, 5);
  assert.ok(r.characters.includes("Alex"));
});

test("LLM mock extracts Wachowski directors", async () => {
  const chatSupplier = {
    chat: async () => ({ text: `{"genre":"sci-fi","directors":["Wachowski"],"writers":[],"tones":[],"setting":"space","characters":["Alex","Maya"],"totalPages":15,"requestedPages":1}` }),
  };
  const u = "Hey Clementine, short film genre sci-fi, I want it to sound like the brothers who directed The Matrix, two astronauts, write first page, one location space station";
  const r = await resolveShortFilmIntent(u, { chatSupplier });
  // heuristic will miss characters, LLM provides them
  assert.equal(r.genre, "sci-fi");
  assert.ok(r.influences.directors.some((d) => d.toLowerCase().includes("wachowski")));
});

test("returns null when not short-film-ish", async () => {
  const r = await resolveShortFilmIntent("Hello, how are you?");
  assert.equal(r, null);
});

test("autonomousNames deterministic", () => {
  assert.deepEqual(autonomousNames("five characters", 2), ["Alex", "Maya"]);
});
