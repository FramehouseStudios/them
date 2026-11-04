import test from "node:test";
import assert from "node:assert/strict";
import { paginateFountainDraft, buildPageFlipPayload } from "../lib/clementine/page_flip.js";
import { buildLivePaperPayload } from "../lib/clementine/studio_live_paper.js";

test("short scenes share a printed page; prefixes and title/body boundaries survive", () => {
  const body = "FADE IN:\n\nINT. A - DAY\n\nA clock ticks.\n\nEXT. B - NIGHT\n\nA bell rings.";
  const draft = "Title: ASHES\n\n" + body;
  const pages = paginateFountainDraft(draft);
  assert.equal(pages.length, 1);
  assert.ok(pages[0].startsWith("FADE IN:"));
  assert.ok(pages[0].includes("A clock ticks.") && pages[0].includes("A bell rings."));
  assert.ok(!pages[0].includes("ASHES"));
  assert.equal(buildLivePaperPayload({ id: "p1", latestDraft: draft }).totalPages, 1);
});

test("appended formatted content grows pages; flip cursor is bounded", () => {
  const draft = Array.from({ length: 54 }, (_, i) => `Action ${i + 1}.`).join("\n");
  assert.equal(buildPageFlipPayload({ draft }).totalPages, 1);
  const payload = buildPageFlipPayload({ project: { id: "p1" }, draft: draft + "\nAction 55.", currentPage: 99 });
  assert.equal(payload.totalPages, 2);
  assert.equal(payload.currentPage, 2);
  assert.equal(payload.pageText, "Action 55.");
  assert.equal(payload.hasNext, false);
  assert.equal(payload.hasPrev, true);
});

test("title-only and explicitly empty current draft cannot show remembered pages", () => {
  for (const draft of ["", "Title: ASHES\n\n"]) {
    const payload = buildPageFlipPayload({ draft });
    assert.equal(payload.totalPages, 0);
    assert.deepEqual(payload.pages, []);
    assert.equal(payload.hasNext, false);
    assert.equal(payload.hasPrev, false);
    assert.equal(buildLivePaperPayload({ latestDraft: "Remembered text." }, { draft }).totalPages, 0);
  }
});
