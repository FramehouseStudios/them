import test from "node:test";
import assert from "node:assert/strict";
import { splitFountainDocument, importFromFountain } from "../lib/fountain_import.js";
import { paginateScreenplay } from "../lib/screenplay_pagination.js";

test("title boundary retains exact body and document line ranges for LF/CRLF/CR", () => {
  for (const newline of ["\n", "\r\n", "\r"]) {
    const body = ["TIME: Midnight.", "", "INT. CAFÉ - DAY", "", "Zoë waits. 👩🏽‍🚀", ""].join(newline);
    const source = ["Title: ASHES", "Author: Zoë Chen", "    ", body].join(newline);
    const parts = splitFountainDocument(source);
    assert.equal(parts.scriptText, body);
    assert.equal(parts.documentLineOffset, 3);
    const result = paginateScreenplay(source);
    assert.equal(result.pages.length, 1);
    assert.equal(result.pages[0].startLine, 4);
    assert.equal(result.pages[0].endLine, 8);
    assert.ok(!result.pages[0].lines.join("\n").includes("ASHES"));
    assert.ok(importFromFountain(source).scenes.some(scene => scene.lines.some(line => line.text === "TIME: Midnight.")));
  }
});

test("title-only is zero screenplay pages, but ordinary colon action is retained", () => {
  for (const source of ["Title: ASHES", "Title:\r\n    ASHES\r\nAuthor: Zoë\r\n\r\n"]) {
    assert.equal(splitFountainDocument(source).scriptText, "");
    assert.deepEqual(paginateScreenplay(source).pages, []);
  }
  for (const source of ["TIME: Midnight.\n\nA phone rings.", "\nTitle: A sign in the scene.\n\nA phone rings."]) {
    assert.equal(splitFountainDocument(source).scriptText, source);
    assert.ok(paginateScreenplay(source).pages.length);
  }
});

test("body beginning Title is parsed only once and unknown metadata never leaks", () => {
  const body = "Title: A sign in the scene.\n\nThe camera keeps moving.";
  const source = `Title: ASHES\nRevision Color: Blue\n    Green\n\n${body}`;
  assert.equal(splitFountainDocument(source).scriptText, body);
  assert.equal(paginateScreenplay(source).pages[0].lines[0], "Title: A sign in the scene.");
});
