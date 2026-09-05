// T-screenplay-export-pdf — unit tests for the pure PDF exporter plus a
// route fixture that mirrors the production POST /screenplay/export
// pdf branch (index.js has no mount factory for the whole route).

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  exportScreenplayToPDF,
  layoutScreenplayPages,
  respondScreenplayPDF,
  BODY_LINES_PER_PAGE,
  MORE_TEXT,
  CONTD_SUFFIX,
} from "../lib/screenplay_pdf_export.js";

const SHORT_DRAFT = `INT. KITCHEN - NIGHT

Maya crosses to the table.

MAYA
(quietly)
We need to talk.

CUT TO:`;

function actionFiller(rows) {
  return Array.from({ length: rows }, (_, i) => `Beat ${i + 1}.`).join("\n\n");
}

function pageObjectCount(pdf) {
  return (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) || []).length;
}

// ---------- structure ----------

test("[pdf-export] produces a well-formed single-page PDF for a short draft", () => {
  const { pdf, pageCount, scriptPageCount } = exportScreenplayToPDF({ draft: SHORT_DRAFT });
  const text = pdf.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.endsWith("%%EOF\n"));
  assert.equal(pageCount, 1);
  assert.equal(scriptPageCount, 1);
  assert.equal(pageObjectCount(pdf), 1);
  assert.match(text, /\/BaseFont \/Courier/);
  assert.match(text, /\(INT\. KITCHEN - NIGHT\) Tj/);
  assert.match(text, /\(MAYA\) Tj/);
  assert.match(text, /\(\\\(quietly\\\)\) Tj/, "parentheses are escaped in the content stream");
  assert.match(text, /\/Count 1 >>/);
});

test("[pdf-export] xref offsets point at the object headers", () => {
  const { pdf } = exportScreenplayToPDF({ draft: SHORT_DRAFT, title: "Kitchen" });
  const text = pdf.toString("latin1");
  const xrefAt = Number(text.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.equal(text.slice(xrefAt, xrefAt + 4), "xref");
  const entries = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.ok(entries.length >= 5);
  entries.forEach((offset, i) => {
    assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`);
  });
});

test("[pdf-export] same input yields identical bytes", () => {
  const a = exportScreenplayToPDF({ draft: SHORT_DRAFT, title: "Kitchen", draftDate: "Sept 5, 2026" }).pdf;
  const b = exportScreenplayToPDF({ draft: SHORT_DRAFT, title: "Kitchen", draftDate: "Sept 5, 2026" }).pdf;
  assert.ok(a.equals(b));
});

// ---------- title page + numbering ----------

test("[pdf-export] a title adds an uncounted title page; script pages number from 2 on", () => {
  const draft = actionFiller(30); // 30 beats + 29 blank separators = 59 rows -> two script pages
  const { pdf, pageCount, scriptPageCount } = exportScreenplayToPDF({ draft, title: "Jess's Search", draftDate: "Sept 5, 2026" });
  const text = pdf.toString("latin1");
  assert.equal(scriptPageCount, 2);
  assert.equal(pageCount, 3);
  assert.match(text, /\(JESS'S SEARCH\) Tj/);
  assert.match(text, /\(Sept 5, 2026\) Tj/);
  assert.match(text, /\(2\.\) Tj/, "second script page carries 2.");
  assert.doesNotMatch(text, /\(1\.\) Tj/, "first script page is unnumbered");
  assert.doesNotMatch(text, /\(3\.\) Tj/, "the title page never shifts the numbering");
});

test("[pdf-export] without a title there is no title page and no date", () => {
  const { pdf, pageCount } = exportScreenplayToPDF({ draft: SHORT_DRAFT, draftDate: "Sept 5, 2026" });
  assert.equal(pageCount, 1);
  assert.doesNotMatch(pdf.toString("latin1"), /Sept 5, 2026/);
});

// ---------- pagination ----------

test("[pdf-export] blank rows are collapsed and dropped at the top of a page", () => {
  const pages = layoutScreenplayPages("A.\n\n\n\nB.");
  assert.deepEqual(pages[0].map((r) => r.text), ["A.", "", "B."]);
  const filler = actionFiller(26); // 26 beats + 25 blanks = 51 rows
  const spill = layoutScreenplayPages(`${filler}\n\nX.`);
  assert.equal(spill.length, 1, "51 rows + a blank + X = 53 fits on one page");
  const spill2 = layoutScreenplayPages(`${filler}\n\nX.\n\nY.`);
  assert.equal(spill2.length, 2);
  assert.equal(spill2[1][0].text, "Y.", "page 2 does not start with the blank separator");
});

test("[pdf-export] a dialogue block that does not fit breaks with (MORE) and NAME (CONT'D)", () => {
  const dialogue = Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of the speech.`).join(" ");
  const draft = `${actionFiller(24)}\n\nMAYA\n${dialogue}`;
  const pages = layoutScreenplayPages(draft);
  assert.equal(pages.length, 2);
  const first = pages[0];
  assert.equal(first[first.length - 1].text, MORE_TEXT);
  assert.equal(first[first.length - 1].kind, "more");
  assert.equal(first.length, BODY_LINES_PER_PAGE, "the broken page is full");
  assert.equal(pages[1][0].text, `MAYA${CONTD_SUFFIX}`);
  assert.equal(pages[1][0].kind, "character");
  assert.equal(pages[1][1].kind, "dialogue");
  const dialogueRows = pages.flat().filter((r) => r.kind === "dialogue").length;
  assert.equal(dialogueRows, layoutScreenplayPages(`MAYA\n${dialogue}`)[0].filter((r) => r.kind === "dialogue").length, "no dialogue row is lost or duplicated");
});

test("[pdf-export] a cue is never orphaned: the whole block moves when fewer than two rows fit", () => {
  // 26 beats + 25 blanks = 51 rows, plus a blank = 52; 2 rows remain: cue + 1 dialogue.
  const draft = `${actionFiller(26)}\n\nMAYA\nOne.\nTwo.\nThree.`;
  const pages = layoutScreenplayPages(draft);
  assert.equal(pages.length, 2);
  assert.notEqual(pages[0][pages[0].length - 1].kind, "character");
  assert.notEqual(pages[0][pages[0].length - 1].kind, "more");
  assert.deepEqual(pages[1].map((r) => r.text), ["MAYA", "One.", "Two.", "Three."]);
});

test("[pdf-export] a page never ends on a parenthetical", () => {
  // 25 beats + 24 blanks = 49, + blank = 50. Remaining 4: cue + 2 body + MORE.
  // Body row 2 is a parenthetical, so the break pulls back and the block moves whole.
  const draft = `${actionFiller(25)}\n\nMAYA\nOne.\n(beat)\nTwo.\nThree.\nFour.`;
  const pages = layoutScreenplayPages(draft);
  assert.equal(pages.length, 2);
  const lastOnFirst = pages[0][pages[0].length - 1];
  assert.notEqual(lastOnFirst.kind, "parenthetical");
  assert.equal(pages[1][0].text, "MAYA");
});

test("[pdf-export] a scene heading never sits on the last line of a page", () => {
  const filler = actionFiller(27); // 27 + 26 blanks = 53 rows, one line left
  const pages = layoutScreenplayPages(`${filler}\n\nINT. HALL - DAY\n\nShe waits.`);
  assert.equal(pages.length, 2);
  assert.equal(pages[1][0].text, "INT. HALL - DAY");
  assert.equal(pages[1][0].kind, "sceneHeading");
});

test("[pdf-export] long action wraps at 60 columns and dialogue at 35", () => {
  const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
  const [page] = layoutScreenplayPages(`${words}\n\nMAYA\n${words}`);
  const action = page.filter((r) => r.kind === "action");
  const dialogue = page.filter((r) => r.kind === "dialogue");
  assert.ok(action.length >= 3);
  assert.ok(action.every((r) => r.text.length <= 60));
  assert.ok(dialogue.length >= 5);
  assert.ok(dialogue.every((r) => r.text.length <= 35));
});

// ---------- text safety ----------

test("[pdf-export] curly quotes and dashes fold to WinAnsi; unsupported glyphs become ?", () => {
  const { pdf } = exportScreenplayToPDF({ draft: "She said “go” — café → home" });
  const text = pdf.toString("latin1");
  assert.match(text, /\(She said "go" - caf\xE9 \? home\) Tj/);
});

test("[pdf-export] empty draft still yields one empty page", () => {
  const { pdf, pageCount } = exportScreenplayToPDF({ draft: "" });
  assert.equal(pageCount, 1);
  assert.ok(pdf.toString("latin1").startsWith("%PDF-1.4"));
});

// ---------- route fixture (mirrors index.js pdf branch) ----------

function mountPdfFixture(app) {
  app.post("/screenplay/export", express.json(), (req, res) => {
    const draft = String(req.body?.draft || "").replace(/\r\n/g, "\n").trim();
    if (!draft) return res.status(400).json({ stage: "screenplay_export", error: "draft_required" });
    const format = String(req.body?.format || "fountain").trim().toLowerCase();
    if (format !== "pdf") return res.status(400).json({ stage: "screenplay_export", error: "unsupported_format" });
    const title = String(req.body?.title || "").trim().slice(0, 160);
    const baseName = title.replace(/[^A-Za-z0-9 ._-]/g, "_").trim() || "screenplay";
    return respondScreenplayPDF(res, { draft, title, baseName, draftDate: String(req.body?.draft_date || "") });
  });
}

async function withTestServer(fn) {
  const app = express();
  mountPdfFixture(app);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(baseURL, p, body) {
  const r = await fetch(`${baseURL}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: Object.fromEntries(r.headers), buf };
}

test("[pdf-export-route] pdf format streams an attachment with the pdf media type", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export", { draft: SHORT_DRAFT, format: "pdf", title: "Kitchen Scene" });
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "application/pdf");
    assert.equal(r.headers["content-disposition"], 'attachment; filename="Kitchen Scene.pdf"');
    assert.equal(r.headers["x-screenplay-format"], "pdf");
    assert.equal(r.headers["x-screenplay-pdf-pages"], "2");
    assert.ok(r.buf.subarray(0, 5).toString("latin1") === "%PDF-");
  });
});

test("[pdf-export-route] missing draft still wins over format check", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await post(baseURL, "/screenplay/export", { format: "pdf" });
    assert.equal(r.status, 400);
    assert.equal(JSON.parse(r.buf.toString("utf8")).error, "draft_required");
  });
});
