import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  paginateScreenplay,
  classifyLines,
  wrapLine,
  LINES_PER_PAGE,
  CHARS_PER_LINE,
  SPACE_BEFORE,
  estimatedMinutes,
} from "../lib/screenplay_pagination.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.resolve(__dirname, "..", "..", "docs", "pagination", "fixtures.json");

test("[pagination] page model constants follow the Letter/Final Draft rules", () => {
  assert.equal(LINES_PER_PAGE, 54);
  assert.deepEqual(CHARS_PER_LINE, { sceneHeading: 62, action: 62, character: 41, dialogue: 36, parenthetical: 26, transition: 21, blank: 62 });
  assert.deepEqual(SPACE_BEFORE, { sceneHeading: 2, action: 1, character: 1, dialogue: 0, parenthetical: 0, transition: 1, blank: 0 });
  assert.equal(estimatedMinutes(54), 1);
  assert.equal(estimatedMinutes(27), 0.5);
});

test("[pagination] wrap is greedy monospace and cuts oversized words", () => {
  assert.deepEqual(wrapLine("", 10), [""]);
  assert.deepEqual(wrapLine("one two three", 7), ["one two", "three"]);
  assert.deepEqual(wrapLine("abcdefghijkl", 5), ["abcde", "fghij", "kl"]);
  assert.deepEqual(wrapLine("  spaced   out  ", 20), ["spaced out"]);
});

test("[pagination] classifier reads a page like a script", () => {
  const kinds = classifyLines(["INT. KITCHEN - NIGHT", "", "JUNE rinses a cup.", "", "JUNE", "(quiet)", "You came back.", "", "CUT TO:", "", "LATER"]);
  assert.deepEqual(kinds, ["sceneHeading", "blank", "action", "blank", "character", "parenthetical", "dialogue", "blank", "transition", "blank", "action"]);
});

test("[pagination] a scene heading never ends a page and a cue keeps two lines of speech", () => {
  const filler = Array.from({ length: 20 }, (_, i) => `Action line ${i + 1}.`).join("\n");
  const heading = paginateScreenplay(`${filler}\n\nINT. LATE - NIGHT\n\nThe heading moved with this line.`, { linesPerPage: 24 });
  assert.equal(heading.pages.length, 2);
  assert.equal(heading.pages[0].lineCount, 20);
  assert.equal(heading.pages[1].lines[0], "INT. LATE - NIGHT");

  const fits = paginateScreenplay(`${filler}\n\nMARA\nShort.\nStill short.`, { linesPerPage: 24 });
  assert.equal(fits.pages.length, 1, "space (1) + cue + 2 lines = 4 fits exactly in the 4 remaining");
  const tight = paginateScreenplay(`${filler}\nOne more.\n\nMARA\nShort.\nStill short.`, { linesPerPage: 24 });
  assert.equal(tight.pages.length, 2, "with 3 remaining the cue moves with its speech");
  assert.equal(tight.pages[1].lines[0], "MARA");
});

test("[pagination] a long speech splits with (MORE) and CUE (CONT'D)", () => {
  const speech = Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of the speech that runs long.`).join(" ");
  const filler = Array.from({ length: 14 }, (_, i) => `Action line ${i + 1}.`).join("\n");
  const r = paginateScreenplay(`${filler}\n\nSIMONE\n${speech}`, { linesPerPage: 24 });
  assert.equal(r.pages.length, 2);
  const first = r.pages[0].lines;
  assert.equal(first[first.length - 1], "(MORE)");
  assert.equal(r.pages[1].lines[0], "SIMONE (CONT'D)");
  assert.ok(first.filter((l) => l && l !== "(MORE)" && l !== "SIMONE").length >= 2, "at least two dialogue lines before the split");
  assert.ok(r.pages[1].lines.length - 1 >= 2, "at least two dialogue lines after the split");
  assert.equal(r.pages[0].startLine, 1);
  assert.equal(r.pages[1].startLine, 16, "the CONT'D cue reports the original cue line, so the speech is reachable from both pages");
});

test("[pagination] long action overflows line by line and raw drafts keep the old cut", () => {
  const raw = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join("\n");
  const r = paginateScreenplay(raw, { linesPerPage: 55 });
  assert.deepEqual(r.pages.map((p) => [p.startLine, p.endLine, p.lineCount]), [[1, 55, 55], [56, 110, 55], [111, 120, 10]]);
  assert.equal(paginateScreenplay("", {}).pages.length, 0);
  assert.equal(paginateScreenplay("x", { linesPerPage: 999 }).linesPerPage, 120);
  assert.equal(paginateScreenplay("x", { linesPerPage: 1 }).linesPerPage, 24);
});

test("[pagination] the shared fixtures reproduce exactly (parity with ScreenplayPageLayout.swift)", () => {
  const { fixtures } = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
  assert.ok(fixtures.length >= 5);
  for (const f of fixtures) {
    const r = paginateScreenplay(f.draft, { linesPerPage: f.linesPerPage });
    assert.equal(r.lineCount, f.expected.lineCount, `${f.id} lineCount`);
    assert.equal(r.renderedLineCount, f.expected.renderedLineCount, `${f.id} rendered`);
    assert.equal(r.pages.length, f.expected.pages.length, `${f.id} pages`);
    r.pages.forEach((p, i) => {
      const e = f.expected.pages[i];
      assert.deepEqual(
        { page: p.page, startLine: p.startLine, endLine: p.endLine, lineCount: p.lineCount, firstLine: p.lines[0] ?? "", lastLine: p.lines[p.lines.length - 1] ?? "", moreCount: p.lines.filter((l) => l === "(MORE)").length, contdCount: p.lines.filter((l) => l.endsWith("(CONT'D)")).length },
        e,
        `${f.id} page ${p.page}`,
      );
    });
  }
});
