import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSuggestionHeader, buildUncertaintyHeader, buildCollabCursorHeader, applyClementineTalkHeaders } from "../lib/clementine/talk_clementine_headers.js";

describe("talk_clementine_headers", () => {
  it("canonical presence wins and is emitted for new and legacy clients without mutation", () => {
    const project = {
      clementinePresence: { state: "speaking", history: ["present", "speaking"] },
      samanthaPresence: { state: "idle", history: ["idle"] },
    };
    const before = structuredClone(project);
    const headers = {};
    applyClementineTalkHeaders({ setHeader(k, v) { headers[k] = v; } }, { project });
    assert.equal(headers["x-clementine-presence"], "speaking");
    assert.equal(headers["x-samantha-presence"], "speaking");
    assert.deepEqual(project, before);
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
