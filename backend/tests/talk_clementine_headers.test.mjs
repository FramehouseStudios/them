import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSuggestionHeader, buildUncertaintyHeader, buildCollabCursorHeader, applyClementineTalkHeaders } from "../lib/clementine/talk_clementine_headers.js";

describe("talk_clementine_headers", () => {
  it("derived cursors use formatted pages, not scene count or physical lines", () => {
    const short = "INT. A - DAY\n\nA clock ticks.\n\nEXT. B - NIGHT\n\nA bell rings.";
    const cursor = JSON.parse(buildCollabCursorHeader({ draft: "Title: ASHES\n\n" + short, project: { characterContexts: [{ name: "JOHN" }] } }));
    assert.deepEqual(cursor, { page: 1, line: 1, basis: "provided_text", authoritative: false });
    const speech = "INT. A - DAY\n\nMARA\n" + "We hear the signal. ".repeat(400);
    const longCursor = JSON.parse(buildCollabCursorHeader({ draft: speech }));
    assert.ok(longCursor.page > 2, "one physical dialogue line can span several printed pages");
    assert.equal(longCursor.authoritative, false);
  });
  it("title-only or absent text cannot invent an inferred page cursor", () => {
    for (const draft of ["", "  ", "Title: ASHES\nAuthor: Zoë\n\n", undefined]) {
      assert.equal(buildCollabCursorHeader({ draft }), "");
    }
  });
  it("invalid explicit cursors fail closed instead of silently choosing page one", () => {
    for (const value of [NaN, Infinity, -1, 0, "not-a-page", "", Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(buildCollabCursorHeader({ draft: "Some text.", collabCursor: { page: value, line: 1 } }), "");
      assert.equal(buildCollabCursorHeader({ draft: "Some text.", collabCursor: { page: 1, line: value } }), "");
    }
    const explicit = JSON.parse(buildCollabCursorHeader({ collabCursor: { page: 25, line: 4, character: "John" } }));
    assert.deepEqual(explicit, { page: 25, line: 4, character: "John", basis: "explicit", authoritative: false });
  });
  it("x-suggestion present when pressure high or draft thin", () => {
    const project = { tone: "tense", characterContexts: [{ name: "John", arcState: { pressure: 6 } }] };
    const s = buildSuggestionHeader({ project, draft: "x", parsed: { genre: "horror" } });
    assert.ok(String(s).length > 5, "should suggest");
  });
  it("x-uncertainty maps high->0.10 low->0.80", () => {
    assert.equal(buildUncertaintyHeader({ quality: { confidence: "high" } }), "0.10");
    assert.equal(buildUncertaintyHeader({ quality: { confidence: "low" } }), "0.80");
    assert.equal(buildUncertaintyHeader({ quality: { ok: true } }), "0.20");
  });
  it("x-collab-cursor explicit cursor JSON", () => {
    const j = buildCollabCursorHeader({ collabCursor: { page: 25, line: 4, character: "John" } });
    const o = JSON.parse(j);
    assert.equal(o.page, 25); assert.equal(o.line, 4); assert.equal(o.character, "John");
  });
  it("apply sets all three headers (suggestion may be empty)", () => {
    const headers = {};
    const res = { setHeader(k,v){ headers[k.toLowerCase()] = String(v); } };
    const project = { characterContexts: [{ name: "Sally", arcState: { pressure: 6 } }] };
    applyClementineTalkHeaders(res, { project, draft: "short", parsed: { genre: "horror" }, quality: { confidence: "medium" }, collabCursor: { page: 2, line: 1 } });
    assert.ok(headers["x-uncertainty"]);
    assert.ok(headers["x-collab-cursor"]);
    // suggestion may be present (pressure high -> should suggest)
    assert.ok(headers["x-suggestion"] || headers["x-uncertainty"] === "0.40");
  });
  it("headers encodeURIComponent safe", () => {
    const headers = {};
    const res = { setHeader(k,v){ headers[k]=String(v); } };
    applyClementineTalkHeaders(res, { project: { characterContexts: [{ name: "Sam", arcState:{pressure:9}}]}, draft:"hi", parsed:{genre:"horror"}, quality:{confidence:"low"} });
    // x-suggestion if present should be encoded without raw spaces failing decode
    if (headers["x-suggestion"]) decodeURIComponent(headers["x-suggestion"]);
    decodeURIComponent(headers["x-collab-cursor"]);
  });
});
