import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExportLink, exportAndShare } from "../lib/clementine/export_share.js";

describe("export_share alias", () => {
  it("buildExportLink tokenized", () => {
    const l = buildExportLink({ projectId: "p1", format: "fdx" });
    assert.ok(l.includes("p1.fdx"));
    assert.ok(l.includes("token="));
  });
  it("exportAndShare fdx + link", () => {
    const r = exportAndShare({ project: { id: "p1" }, draft: "INT. BEDROOM\n\nJOHN\nHi", format: "fdx" });
    assert.ok(r.fdx.includes("FinalDraft") || r.fdx.includes("<?xml"));
    assert.ok(r.link.includes("p1"));
  });
});
