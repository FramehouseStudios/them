import test from "node:test";
import assert from "node:assert/strict";
import { parseShortFilmIntent, parseTotalPages, parseRequestedPages, parseGenre, parseSetting, parseCharacters } from "../lib/clementine/short_film_intent.js";
import { classifyIntent, INTENT } from "../lib/clementine/intents.js";

const BASE = "Hey Clementine, I want to write a short film today 15 pages, genre will be horror film, one location, in a bedroom, three characters, one John, one Sally, one Sam. Write the first five pages and we'll go from there.";

test("parse total pages", () => {
  assert.equal(parseTotalPages(BASE), 15);
  assert.equal(parseTotalPages("short film 15 pages"), 15);
  assert.equal(parseTotalPages("short film fifteen pages"), 15);
});

test("parse requested pages", () => {
  assert.equal(parseRequestedPages(BASE), 5);
  assert.equal(parseRequestedPages("short film 15 pages write first 5 pages"), 5);
  assert.equal(parseRequestedPages("short film 15 pages write first five pages"), 5);
  assert.equal(parseRequestedPages("short film 10 pages write first 3 pages"), 3);
});

test("parse genre", () => {
  assert.equal(parseGenre(BASE), "horror");
  assert.equal(parseGenre("short film 15 pages genre comedy one location bedroom one John"), "comedy");
  assert.equal(parseGenre("short film drama"), "drama");
});

test("parse setting", () => {
  assert.equal(parseSetting(BASE), "bedroom");
  assert.equal(parseSetting("short film 15 pages genre horror one location, in a kitchen"), "kitchen");
});

test("parse characters", () => {
  const chars = parseCharacters(BASE);
  assert.deepEqual(chars, ["John", "Sally", "Sam"]);
});

test("full parse exact utterance", () => {
  const parsed = parseShortFilmIntent(BASE);
  assert.equal(parsed.totalPages, 15);
  assert.equal(parsed.requestedPages, 5);
  assert.equal(parsed.genre, "horror");
  assert.equal(parsed.setting, "bedroom");
  assert.deepEqual(parsed.characters, ["John", "Sally", "Sam"]);
});

test("permutations — reordered clauses", () => {
  const u = "Hey Clementine, I want to write a short film today, three characters John, Sally and Sam, one location bedroom, genre horror, 15 pages. Write first five pages.";
  const p = parseShortFilmIntent(u);
  assert.equal(p.totalPages, 15);
  assert.equal(p.genre, "horror");
  assert.equal(p.setting, "bedroom");
  assert.equal(p.requestedPages, 5);
  assert.equal(p.characters.length, 3);
});

test("case-insensitive", () => {
  const u = "HEY CLEMENTINE, I WANT TO WRITE A SHORT FILM TODAY 15 PAGES GENRE HORROR ONE LOCATION BEDROOM THREE CHARACTERS JOHN SALLY SAM WRITE FIRST FIVE PAGES";
  const p = parseShortFilmIntent(u);
  assert.equal(p.genre, "horror");
  assert.equal(p.setting, "bedroom");
});

test("no match without short film", () => {
  assert.equal(parseShortFilmIntent("I want to write 15 pages horror bedroom John"), null);
});

test("no match without pages", () => {
  assert.equal(parseShortFilmIntent("Hey Clementine short film horror bedroom John Sally Sam"), null);
});

test("no match without genre", () => {
  assert.equal(parseShortFilmIntent("Hey Clementine short film 15 pages one location bedroom John Sally Sam write first five pages"), null);
});

test("no match without characters", () => {
  assert.equal(parseShortFilmIntent("Hey Clementine short film 15 pages genre horror one location bedroom write first five pages"), null);
});

test("word numbers", () => {
  const u = "Hey Clementine short film fifteen pages genre horror one location bedroom three characters one John one Sally one Sam write first five pages";
  const p = parseShortFilmIntent(u);
  assert.equal(p.totalPages, 15);
  assert.equal(p.requestedPages, 5);
});

test("missing requested defaults to total", () => {
  const u = "Hey Clementine short film 15 pages genre horror one location bedroom three characters John Sally Sam";
  const p = parseShortFilmIntent(u);
  assert.equal(p.requestedPages, 15);
});

test("extra punctuation", () => {
  const u = "Hey, Clementine! I want to write a short film today... 15 pages, genre: horror film, one location — in a bedroom. Three characters: John, Sally, Sam. Write the first five pages!!!";
  const p = parseShortFilmIntent(u);
  assert.equal(p.totalPages, 15);
  assert.equal(p.genre, "horror");
  assert.equal(p.setting, "bedroom");
  assert.deepEqual(p.characters, ["John", "Sally", "Sam"]);
});

test("single location kitchen variant", () => {
  const u = "Hey Clementine short film 12 pages genre thriller one location, in a kitchen, two characters, one Alice one Bob write first 4 pages";
  const p = parseShortFilmIntent(u);
  assert.equal(p.totalPages, 12);
  assert.equal(p.requestedPages, 4);
  assert.equal(p.genre, "thriller");
  assert.equal(p.setting, "kitchen");
  assert.deepEqual(p.characters, ["Alice", "Bob"]);
});

test("numeric requested", () => {
  const u = "Hey Clementine short film 15 pages genre horror one location bedroom three characters John Sally Sam write first 5 pages";
  const p = parseShortFilmIntent(u);
  assert.equal(p.requestedPages, 5);
});

test("flag off → greeting (no beta), flag on → SHORT_FILM_BETA", () => {
  const prev = process.env.CLEMENTINE_SHORT_FILM_BETA;
  try {
    delete process.env.CLEMENTINE_SHORT_FILM_BETA;
    // BASE starts with "Hey Clementine" → greeting when beta off (additive gate, no regression)
    assert.equal(classifyIntent(BASE), INTENT.GREETING);
    process.env.CLEMENTINE_SHORT_FILM_BETA = "1";
    assert.equal(classifyIntent(BASE), INTENT.SHORT_FILM_BETA);
    process.env.CLEMENTINE_SHORT_FILM_BETA = "0";
    assert.equal(classifyIntent(BASE), INTENT.GREETING);
    process.env.CLEMENTINE_SHORT_FILM_BETA = "true";
    assert.equal(classifyIntent(BASE), INTENT.SHORT_FILM_BETA);
  } finally {
    if (prev === undefined) delete process.env.CLEMENTINE_SHORT_FILM_BETA;
    else process.env.CLEMENTINE_SHORT_FILM_BETA = prev;
  }
});

test("forced intent still wins over beta", () => {
  const prev = process.env.CLEMENTINE_SHORT_FILM_BETA;
  try {
    process.env.CLEMENTINE_SHORT_FILM_BETA = "1";
    assert.equal(classifyIntent(BASE, { intent: "comfort" }), "comfort");
  } finally {
    if (prev === undefined) delete process.env.CLEMENTINE_SHORT_FILM_BETA;
    else process.env.CLEMENTINE_SHORT_FILM_BETA = prev;
  }
});

test("empty utterance → null", () => {
  assert.equal(parseShortFilmIntent(""), null);
  assert.equal(parseShortFilmIntent(null), null);
});

// PR-E probes — five phrasings from review: singular page, >15, without "character", all genres/directors/writers/tones
test("probe: 15 page singular", () => {
  const p = parseShortFilmIntent("Hey Clementine, I want to write a short film today 15 page, genre will be horror film, one location, in a bedroom, three characters, one John, one Sally, one Sam. Write the first five pages.");
  assert.equal(p.totalPages, 15);
  assert.equal(p.genre, "horror");
});

test("probe: twenty pages (word number >15)", () => {
  const p = parseShortFilmIntent("Hey Clementine, short film twenty pages, genre sci-fi, one location bedroom, three characters John, Sally and Sam, write first five pages");
  assert.equal(p.totalPages, 20);
  assert.equal(p.genre, "sci-fi");
  assert.deepEqual(p.characters, ["John","Sally","Sam"]);
});

test("probe: list without character word", () => {
  const p = parseShortFilmIntent("Hey Clementine, I want to write a short film today 15 pages, genre horror, one location bedroom, John, Sally and Sam. Write first five pages.");
  assert.equal(p.totalPages, 15);
  assert.deepEqual(p.characters, ["John","Sally","Sam"]);
});

test("probe: short list without character, no first pages (defaults to total)", () => {
  const p = parseShortFilmIntent("Hey Clementine, short film 15 pages, genre horror, one location bedroom, John, Sally and Sam");
  assert.equal(p.totalPages, 15);
  assert.deepEqual(p.characters, ["John","Sally","Sam"]);
  assert.equal(p.requestedPages, 15);
});

test("probe: open genre + director/writer/tone influences", () => {
  const p = parseShortFilmIntent("Hey Clementine, I want to write a short film today 15 pages, genre fantasy, one location bedroom, three characters, one John, one Sally, one Sam. It should feel like del Toro and writer Charlie Kaufman, tone gritty. Write first five pages.");
  assert.equal(p.genre, "fantasy");
  assert.ok(p.influences.directors.some(d => d.toLowerCase().includes("toro")));
  assert.ok(p.influences.writers.includes("Charlie Kaufman"));
  assert.ok(p.influences.tones.includes("gritty"));
});
