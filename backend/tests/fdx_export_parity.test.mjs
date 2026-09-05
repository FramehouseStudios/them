import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportToFDX } from "../lib/fdx_export.js";

describe("fdx_export parity", () => {
  it("exact XML for 2-scene script with one dual cue and one revised line", () => {
    const fdx = exportToFDX({
      title: { title: "Test", author: "A" },
      scenes: [
        {
          heading: "INT. ROOM - DAY",
          lines: [
            { kind: "character", name: "ALEX", dialogue: "Hi.", dual: true },
            { kind: "action", text: "She walks." },
          ],
        },
        {
          heading: "INT. HALL - NIGHT",
          lines: [
            { kind: "action", text: "He waits.*", revision: true },
          ],
        },
      ],
    });
    // Scene numbers
    assert.match(fdx, /<Paragraph Type="Scene Heading" Number="1"><Text>INT\. ROOM - DAY<\/Text>/);
    assert.match(fdx, /<Paragraph Type="Scene Heading" Number="2"><Text>INT\. HALL - NIGHT<\/Text>/);
    // Dual dialogue attribute on character and dialogue
    assert.match(fdx, /<Paragraph Type="Character" DualDialogue="Yes"><Text>ALEX<\/Text>/);
    assert.match(fdx, /<Paragraph Type="Dialogue" DualDialogue="Yes"><Text>Hi\.<\/Text>/);
    // Revision mark
    assert.match(fdx, /<Paragraph Revision="1" Type="Action"><Text>He waits\.\*<\/Text>/);
    // Title page draft date auto-filled when title present
    assert.match(fdx, /Draft Date:/);
  });

  it("draft date is NOT auto-filled when title is empty", () => {
    const fdx = exportToFDX({
      title: { title: "", author: "A" },
      scenes: [{ heading: "INT. ROOM - DAY", lines: [{ kind: "action", text: "x" }] }],
    });
    // When title is empty, no TitlePage at all, so no Draft Date
    assert.equal(fdx.includes("Draft Date"), false);
    const fdx2 = exportToFDX({
      title: { title: "   ", contact: "c@example.com" },
      scenes: [],
    });
    assert.equal(fdx2.includes("Draft Date"), false);
  });
});
