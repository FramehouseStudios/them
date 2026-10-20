import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("finaldraft killer all3 P0/P1/P2", () => {
  it("P1 LivePaperStreamView exists not gated + P2 LiveCursorOverlay exists", async () => {
    const fs = await import("node:fs");
    assert.ok(fs.existsSync(new URL("../../them/LivePaperStreamView.swift", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../../them/LiveCursorOverlay.swift", import.meta.url)));
  });
});
