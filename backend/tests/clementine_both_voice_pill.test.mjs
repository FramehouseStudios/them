import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildVoiceHeaders, applyClementineTalkHeaders } from "../lib/clementine/talk_clementine_headers.js";

describe("clementine both voice pill (x-voice-learn/x-vuln-ask)", () => {
  it("voice headers encode voice|cadence|learned and vuln ask when thin/low conf", () => {
    const project = { versions: [{ draft: "hi" }], characterContexts: [{ name: "John", voice: "grounded", backstory: "x", memory: [] }] };
    const v = buildVoiceHeaders({ project, parsed: { characters: ["John"] }, draft: "x", quality: { confidence: "low" }, ownerKey: "owner1" });
    assert.ok(typeof v.voice === "string" && v.voice.length > 0);
    assert.ok(typeof v.cadence === "string");
    assert.ok(v.learned >= 0);
    // thin draft + low conf -> shouldAsk true -> vulnAsk present
    assert.ok(v.vulnAsk.length > 5, "vulnAsk should be present for thin+low");
    assert.ok(Array.isArray(v.vulnOptions) && v.vulnOptions.length === 2);
  });
  it("apply sets x-voice-learn always, x-vuln-* only when thin", () => {
    const headers = {};
    const res = { setHeader(k,v){ headers[k.toLowerCase()] = String(v); } };
    const project = { versions: [{ draft: "short" }], characterContexts: [{ name: "Sally" }] };
    applyClementineTalkHeaders(res, { project, draft: "x", parsed: {}, quality: { confidence: "low" }, ownerKey: "o1" });
    assert.ok(headers["x-voice-learn"], "x-voice-learn always");
    // thin draft => vulnAsk present
    assert.ok(headers["x-vuln-ask"], "x-vuln-ask present when thin");
    assert.ok(headers["x-vuln-options"] || headers["x-uncertainty"]);
    decodeURIComponent(headers["x-voice-learn"]);
    if (headers["x-vuln-ask"]) decodeURIComponent(headers["x-vuln-ask"]);
  });
  it(" Swift BackendClient parses new headers (x-voice-learn etc) via parseClementineHeaders", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../../them/BackendClient.swift", import.meta.url), "utf8");
    assert.ok(src.includes('field: "x-voice-learn"'), "Swift must parse x-voice-learn");
    assert.ok(src.includes('field: "x-vuln-ask"'), "Swift must parse x-vuln-ask");
    assert.ok(src.includes("BackendCollabCursor"), "collab cursor type exists");
    // Swift file for pill exists and not gated
    const pillExists = fs.existsSync(new URL("../../them/ClementineSuggestionPill.swift", import.meta.url));
    assert.ok(pillExists, "ClementineSuggestionPill.swift exists");
  });
});
