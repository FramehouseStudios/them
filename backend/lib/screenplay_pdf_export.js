// T-screenplay-export-pdf — pure Fountain-style draft → PDF exporter.
//
// Used by POST /screenplay/export when format=pdf. Hand-written PDF 1.4
// (no dependency): Letter, Courier 12 via the standard-14 font so nothing
// is embedded, 6 lines per inch, studio margins. Same line typing as the
// Markdown/FDX projections (paragraphTypeForLine) so a given line lands
// in the same role in every export.
//
// Pagination rules (industry conventions the readers expect):
//   - 54 body lines per page (9" of text at 6 lpi), page numbers "N." at
//     the top right from page 2 on; page 1 is unnumbered.
//   - Optional title page (when a title is given) that is not counted.
//   - A dialogue block that does not fit is split with "(MORE)" at the
//     bottom and "NAME (CONT'D)" at the top of the next page, but only
//     when at least two dialogue rows fit before the break; otherwise the
//     whole block moves to the next page so a cue is never orphaned.
//   - A scene heading never sits on the last line of a page.
//   - Blank rows are collapsed and dropped at the top of a page.
//
// Pure: same input → same bytes. No I/O, no LLM, no clock (the draft date
// on the title page is only printed when the caller passes one).

import { paragraphTypeForLine } from "./screenplay_markdown_export.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const FONT_SIZE = 12;
const LINE_HEIGHT = 12; // 6 lines per inch
const CHAR_WIDTH = 7.2; // Courier 12pt = 10 characters per inch
const LEFT_MARGIN = 108; // 1.5"
const RIGHT_EDGE = 540; // 7.5"
const FIRST_BASELINE = PAGE_HEIGHT - 72 - 10; // 1" top margin, Courier ascent
const HEADER_BASELINE = PAGE_HEIGHT - 36; // 0.5"
const BODY_LINES_PER_PAGE = 54;
const MAX_PAGES = 400;

const INDENT = Object.freeze({
  action: LEFT_MARGIN,
  sceneHeading: LEFT_MARGIN,
  dialogue: 180, // 2.5"
  parenthetical: 223, // 3.1"
  character: 266, // 3.7"
});
const WIDTH_CHARS = Object.freeze({
  action: 60,
  sceneHeading: 60,
  dialogue: 35,
  parenthetical: 30,
  character: 38,
  transition: 60,
});

const MORE_TEXT = "(MORE)";
const CONTD_SUFFIX = " (CONT'D)";

// ---------- text ----------

function toWinAnsi(text) {
  return String(text)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[\t\r\n\f\v]/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function escapePdfText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapWords(text, width) {
  const words = text.split(/\s+/).filter(Boolean);
  const rows = [];
  let current = "";
  for (let word of words) {
    while (word.length > width) {
      if (current) {
        rows.push(current);
        current = "";
      }
      rows.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += " " + word;
    } else {
      rows.push(current);
      current = word;
    }
  }
  if (current) rows.push(current);
  return rows.length ? rows : [""];
}

// ---------- blocks ----------

function parseBlocks(draft) {
  const lines = String(draft || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let previousType = null;
  let dialogue = null;
  const closeDialogue = () => {
    if (dialogue) blocks.push(dialogue);
    dialogue = null;
  };
  for (const raw of lines) {
    const trimmed = toWinAnsi(raw).trim();
    if (!trimmed) {
      closeDialogue();
      previousType = null;
      if (blocks.length && blocks[blocks.length - 1].kind !== "blank") blocks.push({ kind: "blank" });
      continue;
    }
    const type = paragraphTypeForLine(trimmed, previousType);
    previousType = type;
    if (type === "Character") {
      closeDialogue();
      dialogue = { kind: "dialogue", character: trimmed, parts: [] };
      continue;
    }
    if ((type === "Parenthetical" || type === "Dialogue") && dialogue) {
      dialogue.parts.push({ kind: type === "Parenthetical" ? "parenthetical" : "dialogue", text: trimmed });
      continue;
    }
    closeDialogue();
    if (type === "Scene Heading") blocks.push({ kind: "sceneHeading", text: trimmed.toUpperCase() });
    else if (type === "Transition") blocks.push({ kind: "transition", text: trimmed.toUpperCase() });
    else if (type === "Parenthetical") blocks.push({ kind: "action", text: trimmed });
    else blocks.push({ kind: "action", text: trimmed });
  }
  closeDialogue();
  while (blocks.length && blocks[blocks.length - 1].kind === "blank") blocks.pop();
  return blocks;
}

function row(kind, text) {
  return { kind, text };
}

function rowsForBlock(block) {
  switch (block.kind) {
    case "blank":
      return [row("blank", "")];
    case "sceneHeading":
      return wrapWords(block.text, WIDTH_CHARS.sceneHeading).map((t) => row("sceneHeading", t));
    case "transition":
      return wrapWords(block.text, WIDTH_CHARS.transition).map((t) => row("transition", t));
    case "action":
      return wrapWords(block.text, WIDTH_CHARS.action).map((t) => row("action", t));
    default:
      return [];
  }
}

function dialogueBodyRows(block) {
  const rows = [];
  for (const part of block.parts) {
    const width = part.kind === "parenthetical" ? WIDTH_CHARS.parenthetical : WIDTH_CHARS.dialogue;
    for (const t of wrapWords(part.text, width)) rows.push(row(part.kind, t));
  }
  return rows;
}

function cueRow(name) {
  return row("character", name.length > WIDTH_CHARS.character ? name.slice(0, WIDTH_CHARS.character) : name);
}

// ---------- pagination ----------

function layoutScreenplayPages(draft) {
  const blocks = parseBlocks(draft);
  const pages = [];
  let page = [];
  const remaining = () => BODY_LINES_PER_PAGE - page.length;
  const newPage = () => {
    pages.push(page);
    page = [];
  };
  const push = (rows) => {
    for (const r of rows) {
      if (r.kind === "blank" && page.length === 0) continue;
      if (page.length >= BODY_LINES_PER_PAGE) newPage();
      if (r.kind === "blank" && page.length === 0) continue;
      page.push(r);
    }
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (pages.length >= MAX_PAGES) break;

    if (block.kind === "sceneHeading") {
      const rows = rowsForBlock(block);
      const hasNext = blocks.slice(index + 1).some((b) => b.kind !== "blank");
      if (hasNext && remaining() <= rows.length) newPage();
      push(rows);
      continue;
    }

    if (block.kind !== "dialogue") {
      push(rowsForBlock(block));
      continue;
    }

    let name = block.character;
    let body = dialogueBodyRows(block);
    if (body.length === 0) {
      if (remaining() < 1) newPage();
      push([cueRow(name)]);
      continue;
    }
    // Loop: place as much of the block as fits, breaking with (MORE)/(CONT'D).
    while (body.length > 0) {
      const needed = 1 + body.length;
      if (needed <= remaining()) {
        push([cueRow(name), ...body]);
        body = [];
        break;
      }
      // cue + at least two dialogue rows + (MORE) must fit to break here.
      const bodyRowsThatFit = remaining() - 2;
      const canBreak = bodyRowsThatFit >= 2 && body.slice(0, bodyRowsThatFit).some((r) => r.kind === "dialogue");
      if (!canBreak) {
        newPage();
        continue;
      }
      let cut = bodyRowsThatFit;
      // Do not end a page on a parenthetical; pull the break back to the last dialogue row.
      while (cut > 0 && body[cut - 1].kind !== "dialogue") cut -= 1;
      if (cut < 2) {
        newPage();
        continue;
      }
      push([cueRow(name), ...body.slice(0, cut), row("more", MORE_TEXT)]);
      body = body.slice(cut);
      newPage();
      if (!name.endsWith(CONTD_SUFFIX)) name = name + CONTD_SUFFIX;
    }
  }
  if (page.length || pages.length === 0) pages.push(page);
  return pages;
}

// ---------- drawing ----------

function xFor(rowItem) {
  switch (rowItem.kind) {
    case "character":
    case "more":
      return INDENT.character;
    case "dialogue":
      return INDENT.dialogue;
    case "parenthetical":
      return INDENT.parenthetical;
    case "transition":
      return RIGHT_EDGE - rowItem.text.length * CHAR_WIDTH;
    default:
      return LEFT_MARGIN;
  }
}

function textOp(x, y, text) {
  return `1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${escapePdfText(text)}) Tj\n`;
}

function bodyPageStream(rows, pageNumber) {
  let stream = `BT\n/F1 ${FONT_SIZE} Tf\n`;
  if (pageNumber >= 2) {
    const label = `${pageNumber}.`;
    stream += textOp(RIGHT_EDGE - label.length * CHAR_WIDTH, HEADER_BASELINE, label);
  }
  rows.forEach((r, i) => {
    if (!r.text) return;
    stream += textOp(xFor(r), FIRST_BASELINE - i * LINE_HEIGHT, r.text);
  });
  stream += "ET\n";
  return stream;
}

function titlePageStream({ title, draftDate }) {
  const titleRows = wrapWords(toWinAnsi(title).trim().toUpperCase(), WIDTH_CHARS.action);
  let stream = `BT\n/F1 ${FONT_SIZE} Tf\n`;
  const startY = PAGE_HEIGHT - 3.5 * 72;
  titleRows.forEach((t, i) => {
    stream += textOp((PAGE_WIDTH - t.length * CHAR_WIDTH) / 2, startY - i * LINE_HEIGHT, t);
  });
  const date = toWinAnsi(draftDate || "").trim();
  if (date) {
    stream += textOp(RIGHT_EDGE - date.length * CHAR_WIDTH, 72 + LINE_HEIGHT, date.slice(0, 40));
  }
  stream += "ET\n";
  return stream;
}

function assemblePdf(streams) {
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject(null);
  const pagesId = addObject(null);
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  const pageIds = [];
  for (const stream of streams) {
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] `
      + `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/**
 * Render a Fountain-style draft to a PDF buffer.
 * @param {{ draft: string, title?: string, draftDate?: string }} opts
 * @returns {{ pdf: Buffer, pageCount: number, scriptPageCount: number }}
 */
function exportScreenplayToPDF({ draft, title = "", draftDate = "" } = {}) {
  const pages = layoutScreenplayPages(draft);
  const streams = [];
  const cleanTitle = toWinAnsi(title || "").trim();
  if (cleanTitle) streams.push(titlePageStream({ title: cleanTitle, draftDate }));
  pages.forEach((rows, i) => streams.push(bodyPageStream(rows, i + 1)));
  return { pdf: assemblePdf(streams), pageCount: streams.length, scriptPageCount: pages.length };
}

function respondScreenplayPDF(res, { draft, title, baseName, draftDate }) {
  const filename = `${baseName || "screenplay"}.pdf`;
  const { pdf, pageCount } = exportScreenplayToPDF({ draft, title, draftDate });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("x-screenplay-format", "pdf");
  res.setHeader("x-screenplay-pdf-pages", String(pageCount));
  return res.status(200).send(pdf);
}

export {
  exportScreenplayToPDF,
  layoutScreenplayPages,
  respondScreenplayPDF,
  BODY_LINES_PER_PAGE,
  MORE_TEXT,
  CONTD_SUFFIX,
};
