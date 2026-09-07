import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { debounceLivePaper, optimisticPageChunk } from "../lib/clementine/smooth_experience.js";

describe("smooth amazing (debounce + optimistic)", () => {
  it("debounce caches within delay", () => {
    const r1 = debounceLivePaper({ projectId: "p1", draft: "hi", delay: 1000 });
    const r2 = debounceLivePaper({ projectId: "p1", draft: "hi", delay: 1000 });
    assert.equal(r1.cached, false);
    assert.equal(r2.cached, true);
  });
  it("optimistic chunk", () => {
    const c = optimisticPageChunk({ page: 1, totalPages: 5, pageText: "INT. BEDROOM" });
    assert.equal(c.optimistic, true);
    assert.equal(c.page, 1);
  });
  it("SmoothTransitions.swift exists not gated", async () => {
    const fs = await import("node:fs");
    assert.ok(fs.existsSync(new URL("../../them/SmoothTransitions.swift", import.meta.url)));
  });
});
