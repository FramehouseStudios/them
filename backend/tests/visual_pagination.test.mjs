import test from "node:test";
import assert from "node:assert/strict";
import { paginateVisualDraft, buildVisualPaperPayload, exportVisualFDX, LINES_PER_PAGE } from "../lib/clementine/visual_pagination.js";
import { paginateFountainDraft } from "../lib/clementine/page_flip.js";

test("LINES_PER_PAGE is 55 and wraps paginateFountainDraft", () => {
  assert.equal(LINES_PER_PAGE, 55);
  // wrapping: for plain line-count input without headings, both respect 55
  const draft = Array.from({length: 120}, (_,i)=>`Line ${i+1}`).join("\n");
  const plain = paginateFountainDraft(draft, { linesPerPage: 55 });
  const visual = paginateVisualDraft(draft, { linesPerPage: 55 });
  assert.ok(plain.length >= 2);
  assert.ok(visual.length >= 2);
  // visual respects 55 line budget (element-aware still within 55)
  assert.equal(plain.length, 3); // 120/55 = 3 pages
});

test("element-aware: character+dialogue block not split across pages", () => {
  // Build a draft that would split mid-block if naive line-counted
  const lines = [];
  // Fill page to 54 lines
  for (let i=0;i<54;i++) lines.push(`Action line ${i+1}`);
  // Next element is a character block (3 lines) that should move to next page
  lines.push("JUNE");
  lines.push("(whispering)");
  lines.push("Hello there this is dialogue that should stay together.");
  lines.push("Final action line after dialogue");
  const draft = lines.join("\n");
  const pages = paginateVisualDraft(draft, { linesPerPage: 55 });
  assert.ok(pages.length >= 2);
  // second page should start with JUNE, not split
  assert.ok(pages[1].includes("JUNE"));
  assert.ok(pages[1].includes("Hello there"));
  // first page should not contain JUNE
  assert.equal(pages[0].includes("JUNE"), false);
});

test("heading-aware pagination produces flip-through pages", () => {
  // Make draft exceed 55 lines so element-aware still paginates
  const filler = Array.from({length:60}, (_,i)=>`Action line ${i+1}`).join("\n");
  const draft = [
    "INT. BEDROOM - NIGHT",
    filler,
    "INT. KITCHEN - DAY",
    "Action in kitchen.",
  ].join("\n\n");
  const pages = paginateVisualDraft(draft);
  assert.ok(pages.length >= 2);
  assert.ok(pages[0].includes("INT. BEDROOM"));
  assert.ok(pages.some(x=>x.includes("INT. KITCHEN")));
});

test("buildVisualPaperPayload wraps paginate with 55 lines and flip payload", () => {
  const draft = ["INT. A - DAY","act","INT. B - DAY","act","INT. C - DAY","act"].join("\n\n");
  const payload = buildVisualPaperPayload({ project:{id:"p1", logline:"Logline"}, draft, currentPage:1 });
  assert.equal(payload.linesPerPage, 55);
  assert.ok(payload.totalPages >= 1);
  assert.equal(payload.currentPage, 1);
  assert.ok(Array.isArray(payload.pages));
  assert.equal(typeof payload.hasNext, "boolean");
  assert.equal(typeof payload.hasPrev, "boolean");
});

test("FDX hook exports valid Final Draft XML", () => {
  const screenplay = {
    scenes: [
      { heading: "INT. KITCHEN - NIGHT", lines: [
        { kind:"action", text:"She walks in." },
        { kind:"character", name:"JUNE", dialogue:"Hello." }
      ]}
    ]
  };
  const fdx = exportVisualFDX(screenplay);
  assert.ok(fdx.includes('<?xml version="1.0"'));
  assert.ok(fdx.includes('<FinalDraft'));
  assert.ok(fdx.includes('Scene Heading'));
  assert.ok(fdx.includes('JUNE'));
});

test("FDX hook from Fountain string also valid", () => {
  const draft = "INT. KITCHEN - NIGHT\n\nShe walks in.\n\nJUNE\nHello.";
  const fdx = exportVisualFDX(draft);
  assert.ok(fdx.includes('<FinalDraft'));
  assert.ok(fdx.includes('INT. KITCHEN'));
});

test("structured screenplay pagination element-aware 55", () => {
  const screenplay = {
    scenes: Array.from({length:6}, (_,i)=>({ heading:`INT. ROOM ${i+1} - DAY`, lines:[{kind:"action", text:"Action"}]}))
  };
  const pages = paginateVisualDraft(screenplay);
  assert.ok(pages.length >= 1);
  assert.ok(pages[0].length > 0);
});
