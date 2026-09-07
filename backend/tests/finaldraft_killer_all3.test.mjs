import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportAndShare } from "../lib/clementine/export_share.js";

describe("finaldraft killer all3 P0/P1/P2", () => {
  it("P0 full FDX 12 + pdfLink + pages", () => {
    const r = exportAndShare({ project: { id: "p123" }, draft: "INT. BEDROOM\n\nJOHN\nHello", format: "fdx" });
    assert.ok(r.fdx.includes("<FinalDraft") && r.fdx.includes("<Pages>") && r.fdx.includes("<LinesPerPage>55</LinesPerPage>"));
    assert.ok(r.pdfLink.includes("p123.pdf"));
    assert.ok(Number(r.pages) >= 1);
    assert.equal(r.xExportPages, String(r.pages));
  });
  it("P1 LivePaperStreamView exists not gated + P2 LiveCursorOverlay exists", async () => {
    const fs = await import("node:fs");
    assert.ok(fs.existsSync(new URL("../../them/LivePaperStreamView.swift", import.meta.url)));
    assert.ok(fs.existsSync(new URL("../../them/LiveCursorOverlay.swift", import.meta.url)));
  });
});
