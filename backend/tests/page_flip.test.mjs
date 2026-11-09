import test from "node:test";
import assert from "node:assert/strict";
import { paginateFountainDraft, buildPageFlipPayload } from "../lib/clementine/page_flip.js";
import { generateOfflineShortFilmDraft } from "../lib/clementine/short_film_prompt.js";

test("paginate offline 5p → 5 pages flippable", () => {
  const parsed = { setting:"bedroom", characters:["John","Sally","Sam"], requestedPages:5 };
  const draft = generateOfflineShortFilmDraft(parsed);
  const pages = paginateFountainDraft(draft);
  assert.equal(pages.length, 5);
  assert.ok(pages[0].includes("INT. BEDROOM"));
  const payload = buildPageFlipPayload({ project:{id:"p1", logline:"L"}, draft, currentPage:1 });
  assert.equal(payload.totalPages, 5);
  assert.equal(payload.hasNext, true);
  assert.equal(payload.hasPrev, false);
  assert.ok(payload.pageText.includes("INT. BEDROOM"));
});

test("flip through when more pages added (5→6)", () => {
  const d5 = generateOfflineShortFilmDraft({ setting:"bedroom", characters:["A","B","C"], requestedPages:5 });
  const d6 = generateOfflineShortFilmDraft({ setting:"bedroom", characters:["A","B","C"], requestedPages:6 });
  const p5 = buildPageFlipPayload({ project:{id:"p1"}, draft:d5, currentPage:5 });
  const p6 = buildPageFlipPayload({ project:{id:"p1"}, draft:d6, currentPage:6 });
  assert.equal(p5.totalPages, 5);
  assert.equal(p6.totalPages, 6);
  assert.equal(p6.hasNext, false);
  assert.ok(p6.pageText.includes("INT. BEDROOM"));
  // flipping: totalPages grows, pageText for last page exists
  assert.ok(p6.pages[5].includes("INT. BEDROOM"));
});
