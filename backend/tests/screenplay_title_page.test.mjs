import test from "node:test";
import assert from "node:assert/strict";
import { readTitlePage } from "../lib/screenplay_title_page.js";
import { paginateScreenplay } from "../lib/screenplay_pagination.js";

test("reads a Fountain title page with a multi-line contact", () => {
  const lines = ["Title: The Long Night", "Credit: Written by", "Author: Sam", "Contact:", "    sam@example.com", "", "INT. DINER - NIGHT"];
  const { titlePage, lineIndexes } = readTitlePage(lines);
  assert.deepEqual(titlePage, { title: "The Long Night", credit: "Written by", author: "Sam", contact: "sam@example.com" });
  assert.deepEqual(lineIndexes, [0, 1, 2, 3, 4]);
});

test("colon dialogue and a TITLE card are not a title page", () => {
  assert.equal(readTitlePage(["SAM: Hi.", "MAE: Hello."]).titlePage, null);
  assert.equal(readTitlePage(["TITLE: NEW YORK, 1979", "Traffic crawls past."]).titlePage, null);
});

test("the title page is not part of page 1 or the page count", () => {
  const draft = "Title: The Long Night\nAuthor: Sam\n\nINT. DINER - NIGHT\n\nMae waits.";
  const result = paginateScreenplay(draft);
  assert.equal(result.pages.length, 1);
  assert.deepEqual(result.pages[0].lines, ["INT. DINER - NIGHT", "", "Mae waits."]);
  assert.equal(result.pages[0].startLine, 4, "source lines still count the title page lines");
});
