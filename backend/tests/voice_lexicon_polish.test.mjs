import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { polishVoiceLexicon } from "../lib/clementine/voice_lexicon_polish.js";

describe("voice lexicon polish (writing craft)", () => {
  it("John short cuts hedge", () => {
    const r = polishVoiceLexicon({ character: "John", line: "I just want to stay very much.", lexicon: ["shadow"] });
    assert.ok(!r.polished.toLowerCase().includes("just") || r.polished.includes("shadow"));
    assert.equal(r.character, "John");
  });
  it("Sally lyrical adds pause", () => {
    const r = polishVoiceLexicon({ character: "Sally", line: "We need to go. We need to stay.", lexicon: ["remember"] });
    assert.ok(r.polished.includes("—") || r.polished.includes("remember"));
  });
});
