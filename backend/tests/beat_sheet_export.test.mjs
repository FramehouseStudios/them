import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBeatSheet, exportBeatSheetFDX } from "../lib/clementine/beat_sheet_export.js";

describe("beat sheet export (screenwriting craft)", () => {
  it("8 seq beat sheet with craft", () => {
    const bs = buildBeatSheet({ genre: "horror", tone: "dark", totalPages: 90 });
    assert.equal(bs.length, 8);
    assert.ok(bs[0].craft && bs[0].craft.id);
    assert.ok(bs[3].setpiece.includes("midpoint") || bs[3].title==="Midpoint");
    const fdx = exportBeatSheetFDX({ beatSheet: bs });
    assert.ok(fdx.includes("<FinalDraft>") && fdx.includes("Seq 1"));
  });
});
