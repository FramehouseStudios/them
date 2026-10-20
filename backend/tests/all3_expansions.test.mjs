import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transformEdit, applyCollabEdits, pushHistory, undoHistory, historySize } from "../lib/clementine/collab_edit.js";
import { getWriterVoiceProfile, updateWriterVoiceProfile, getLexicon } from "../lib/clementine/clementine_voice.js";
import { getSevenPointBeats, SEVEN_POINT } from "../lib/clementine/story_structure_knowledge.js";
import { buildCommentary, buildInlineCommentary } from "../lib/clementine/director_commentary.js";
import { revertToProvenance } from "../lib/clementine/inspector_ux.js";

describe("all3 expansions P0/P1/P2", () => {
  it("P0 collab multi-line + OT range + history", () => {
    const draft = "INT. BEDROOM\n\nJOHN\nHello\n\nSALLY\nHi\n\nSAM\nHey";
    const out = applyCollabEdits(draft, [{ page: 1, line: 3, count: 2, newText: "JOHN\nHola\n(whispering)\nBonjour" }]);
    assert.ok(out.includes("Hola") && out.includes("Bonjour"));
    // OT range: a edits line 1 count 2, b at line 2 should shift
    const a = { page: 1, line: 1, character: "John", count: 2 };
    const b = { page: 1, line: 2, character: "John" };
    const t = transformEdit("", a, b);
    assert.equal(t.line, 4);
    pushHistory("k1", draft, { page: 1, line: 1 });
    assert.equal(historySize("k1"), 1);
    assert.ok(undoHistory("k1"));
  });
  it("P0 PageCurlView exists (not gated, not line-counted)", async () => {
    const fs = await import("node:fs");
    assert.ok(fs.existsSync(new URL("../../them/PageCurlView.swift", import.meta.url)));
  });
  it("P1 lexicon learn top 5 + 7-point", () => {
    const p = getWriterVoiceProfile("lex-test-" + Date.now());
    updateWriterVoiceProfile(p, { sample: "the shadow remembers the bedroom the bedroom shadow" });
    // use ownerKey path
    const key = "lex-" + Date.now();
    updateWriterVoiceProfile(key, { sample: "shadow bedroom shadow bedroom shadow" });
    const lex = getLexicon(key);
    assert.ok(lex.includes("shadow") || lex.includes("bedroom"));
    assert.ok(lex.length <= 5);
    const seven = getSevenPointBeats({ genre: "horror" });
    assert.equal(seven.framework, "7pt");
    assert.equal(seven.sevenPoint.length, 7);
    assert.equal(SEVEN_POINT.length, 7);
  });
  it("P2 inline commentary per line + provenance revert", () => {
    const arr = buildInlineCommentary({ project: { characterContexts: [{ name: "John" }] }, draft: "Line1\nLine2\nLine3" });
    assert.equal(arr.length, 3);
    assert.equal(arr[0].line, 1);
    assert.equal(typeof arr[0].note, "string");
    const r = revertToProvenance({ history: ["user","clementine","coverage","user"], target: "clementine" });
    assert.equal(r.reverted, true);
    assert.deepEqual(r.history, ["user","clementine"]);
  });
});
