import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCharacterVoice } from "../lib/clementine/character_voice.js";

describe("character voice (screenwriting craft)", () => {
  it("John short control, Sally lyrical", () => {
    const j = buildCharacterVoice({ character: "John", lexicon: ["shadow"], ghost: "bedroom ghost", want: "prove safe" });
    assert.ok(j.cadence.includes("control") && j.voice.includes("John"));
    const s = buildCharacterVoice({ character: "Sally", lexicon: ["remember"], want: "be remembered" });
    assert.ok(s.cadence.includes("lyrical"));
  });
});
