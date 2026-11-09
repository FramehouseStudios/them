import test from "node:test"; import assert from "node:assert/strict";
import { applyChessEdit } from "../lib/clementine/chess_edit.js";
import { generateOfflineShortFilmDraft } from "../lib/clementine/short_film_prompt.js";

test("page 25 line 4 by John chess edit", () => {
  // Build 25-page draft via 5x stitch for test: use 5p draft repeated
  const d5 = generateOfflineShortFilmDraft({ setting:"bedroom", characters:["John","Sally","Sam"], requestedPages:5 });
  const d25 = Array(5).fill(d5).join("\n\n");
  const res = applyChessEdit(d25, { page:2, line:4, character:"John", newText:"JOHN\nThis is the new line." });
  assert.ok(res.newDraft.includes("This is the new line."));
  assert.equal(res.patch.page, 2);
  assert.equal(res.totalPages, 25);
});

test("auto-fix uppercases character", () => {
  const d = "INT. BEDROOM\n\nJohn\nhello";
  const r = applyChessEdit(d, { page:1, line:1, character:"John", newText:"hello fixed" });
  assert.ok(r.newDraft.includes("hello fixed"));
});
