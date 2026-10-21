import test from "node:test";
import assert from "node:assert/strict";
import { applyChessEdit, chessEditAndSave } from "../lib/clementine/chess_edit.js";
import { paginateScreenplay } from "../lib/screenplay_pagination.js";

test("one addressed dialogue edit preserves every other byte, title and terminator", () => {
  for (const nl of ["\n", "\r\n", "\r"]) {
    const before = ["Title: ASHES", "Author: Zoë Chen", "", "INT. CAFÉ - DAY", "", "JOHN", "I see the moon.", "", "Zoë watches John. 👩🏽‍🚀", ""].join(nl);
    const result = applyChessEdit(before, { page: 1, line: 4, character: "John", newText: "I see our home." });
    assert.equal(result.newDraft, before.replace("I see the moon.", "I see our home."));
    assert.equal(result.patch.sourceLine, 7);
    assert.equal(result.totalPages, 1);
    assert.ok(!result.newDraft.includes("(MORE)"));
  }
});

test("absent, generated, wrapped, wrong-character and multiline targets fail closed", () => {
  const draft = "INT. ROOM - DAY\n\nJOHN\nHello.\n";
  for (const edit of [
    { page: 99, line: 1 }, { page: 1, line: 2 }, { page: 0, line: 1 },
    { page: 1, line: 4, character: "Sally" }, { page: 1, line: 1, character: "John" },
    { page: 1, line: 4, newText: "One\nTwo" },
  ]) assert.throws(() => applyChessEdit(draft, { newText: "Changed.", ...edit }));
  const long = "INT. ROOM - DAY\n\nJOHN\n" + "The signal is coming through. ".repeat(120);
  const layout = paginateScreenplay(long);
  assert.ok(layout.pages.length > 1);
  for (const page of layout.pages) assert.equal(page.lines.length, page.sourceLineMap.length);
  const row = layout.pages[0].lines.indexOf("(MORE)") + 1;
  assert.ok(row > 0);
  assert.throws(() => applyChessEdit(long, { page: 1, line: row, newText: "Changed." }), /generated/);
  assert.throws(() => applyChessEdit(long, { page: 1, line: 4, newText: "Changed." }), /ambiguous/);
});

test("legacy persistence cannot mutate a project, memory or version", async () => {
  const project = { id: "p1", ownerKey: "u1", versions: [{ id: "v1", draft: "Original words." }] };
  const before = structuredClone(project);
  let commits = 0;
  await assert.rejects(chessEditAndSave({ project, draft: "Original words.", edit: { newText: "Changed." }, commitScreenplayOwnerMutation: () => { commits += 1; } }), /versioned/);
  assert.deepEqual(project, before);
  assert.equal(commits, 0);
});
