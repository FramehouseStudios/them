// Element-aware screenplay pagination.
//
// Ported from the rules in OpenDraft's pagination engine (MIT, © 2026 Proteus
// Technologies — see docs/pagination/NOTICE-opendraft.md), re-implemented here
// in plain JS so the backend route and the iPhone Studio
// (them/ScreenplayPageLayout.swift) count printed pages the same way. The two
// implementations are pinned to each other by docs/pagination/fixtures.json.
//
// The model, in 12-point Courier lines:
//   - US Letter, 1-inch top and bottom margins → 54 lines of body per page.
//   - Characters per line by element, Final Draft indents at 10.33 chars/inch:
//       scene heading / action 62, character 41, dialogue 36,
//       parenthetical 26, transition 21.
//   - Space before a block, in lines: scene heading 2, action 1, character 1,
//     transition 1, dialogue and parenthetical 0; nothing at the top of a page.
//   - A scene heading never ends a page; it moves with the block after it.
//   - A character cue stays with at least two lines of its speech. A speech
//     that does not fit splits with (MORE) at the foot and CUE (CONT'D) at the
//     head of the next page, each costing one line, and only when at least two
//     dialogue lines remain on both sides.
//   - Long action blocks overflow line by line.

export const LINES_PER_PAGE = 54;
export const MIN_LINES_PER_PAGE = 24;
export const MAX_LINES_PER_PAGE = 120;

export const CHARS_PER_LINE = Object.freeze({
  sceneHeading: 62,
  action: 62,
  character: 41,
  dialogue: 36,
  parenthetical: 26,
  transition: 21,
  blank: 62,
});

export const SPACE_BEFORE = Object.freeze({
  sceneHeading: 2,
  action: 1,
  character: 1,
  dialogue: 0,
  parenthetical: 0,
  transition: 1,
  blank: 0,
});

const SCENE_PREFIXES = ["INT.", "EXT.", "INT ", "EXT ", "INT/EXT", "EXT/INT", "I/E.", "I/E ", "EST."];

function isSceneHeading(upper) {
  return SCENE_PREFIXES.some((p) => upper.startsWith(p));
}

function isTransition(upper, original) {
  if (upper.endsWith(" TO:") || upper === "CUT TO:" || upper === "FADE OUT." || upper === "FADE OUT:") {
    return original === upper;
  }
  return upper.startsWith("FADE IN") && original === upper;
}

function isCharacterCue(line) {
  if (line.length > 40 || line !== line.toUpperCase()) return false;
  if (!/[A-Za-z]/.test(line)) return false;
  return !line.endsWith(".") || line.endsWith(")");
}

/** Coarse Fountain element read; mirrors ScreenplayPageLayout.classify. */
export function classifyLines(lines) {
  const kinds = [];
  let inDialogue = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] ?? "").trim();
    if (!line) { kinds.push("blank"); inDialogue = false; continue; }
    const upper = line.toUpperCase();
    if (isSceneHeading(upper)) { kinds.push("sceneHeading"); inDialogue = false; continue; }
    if (isTransition(upper, line)) { kinds.push("transition"); inDialogue = false; continue; }
    if (inDialogue) { kinds.push(line.startsWith("(") ? "parenthetical" : "dialogue"); continue; }
    const previousBlank = index === 0 || !String(lines[index - 1] ?? "").trim();
    const nextExists = index + 1 < lines.length && Boolean(String(lines[index + 1] ?? "").trim());
    if (previousBlank && nextExists && isCharacterCue(line)) { kinds.push("character"); inDialogue = true; continue; }
    kinds.push("action");
  }
  return kinds;
}

/** Greedy monospace word wrap; words longer than the width are cut at it. */
export function wrapLine(text, width) {
  const clean = String(text ?? "").trim();
  if (!clean) return [""];
  const out = [];
  let current = "";
  for (const word of clean.split(/\s+/)) {
    let piece = word;
    while (piece.length > width) {
      if (current) { out.push(current); current = ""; }
      out.push(piece.slice(0, width));
      piece = piece.slice(width);
    }
    if (!current) current = piece;
    else if (current.length + 1 + piece.length <= width) current = `${current} ${piece}`;
    else { out.push(current); current = piece; }
  }
  if (current) out.push(current);
  return out.length ? out : [""];
}

function clampLinesPerPage(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return LINES_PER_PAGE;
  return Math.max(MIN_LINES_PER_PAGE, Math.min(MAX_LINES_PER_PAGE, n));
}

function normalizeDraft(draft) {
  return String(draft ?? "").replace(/\r\n/g, "\n").trim();
}

/**
 * Split the draft into blocks (runs of non-blank lines) with rendered pieces.
 * Each piece: { text, sourceLine (1-based), kind }.
 */
function buildBlocks(lines, kinds) {
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    if (kinds[index] === "blank") { index += 1; continue; }
    const start = index;
    const pieces = [];
    while (index < lines.length && kinds[index] !== "blank") {
      const kind = kinds[index];
      for (const text of wrapLine(lines[index], CHARS_PER_LINE[kind] || 62)) {
        pieces.push({ text, sourceLine: index + 1, kind });
      }
      index += 1;
    }
    blocks.push({ kind: kinds[start], pieces, cue: kinds[start] === "character" ? lines[start].trim() : "" });
  }
  return blocks;
}

export function paginateScreenplay(draft, { linesPerPage: requested } = {}) {
  const linesPerPage = clampLinesPerPage(requested);
  const normalized = normalizeDraft(draft);
  if (!normalized) {
    return { linesPerPage, lineCount: 0, renderedLineCount: 0, pages: [] };
  }
  const lines = normalized.split("\n");
  const kinds = classifyLines(lines);
  const blocks = buildBlocks(lines, kinds);

  const pages = [];
  let current = { number: 1, lines: [], sourceLines: [] };
  const count = () => current.lines.length;
  const closePage = () => {
    pages.push(current);
    current = { number: pages.length + 1, lines: [], sourceLines: [] };
  };
  const place = (piece) => {
    current.lines.push(piece.text);
    if (piece.sourceLine) current.sourceLines.push(piece.sourceLine);
  };
  const placeBlanks = (n) => { for (let i = 0; i < n; i += 1) current.lines.push(""); };
  const blockNeed = (block, atTop) => (atTop ? 0 : SPACE_BEFORE[block.kind] || 0) + block.pieces.length;

  for (let b = 0; b < blocks.length; b += 1) {
    const block = blocks[b];
    const atTop = count() === 0;
    const sb = atTop ? 0 : (SPACE_BEFORE[block.kind] || 0);
    let need = sb + block.pieces.length;
    // A scene heading keeps the block after it on the same page.
    if (block.kind === "sceneHeading" && b + 1 < blocks.length) {
      need += blockNeed(blocks[b + 1], false);
    }
    const remaining = linesPerPage - count();

    if (!atTop && need > remaining) {
      const isSpeech = block.kind === "character" && block.pieces.length >= 5;
      // (MORE) reserve is 1; cue + 2 lines must fit; 2 lines must remain.
      const fit = remaining - sb - 1;
      if (isSpeech && fit >= 3 && block.pieces.length - fit >= 2) {
        placeBlanks(sb);
        for (const piece of block.pieces.slice(0, fit)) place(piece);
        current.lines.push("(MORE)");
        closePage();
        place({ text: `${block.cue} (CONT'D)`, sourceLine: block.pieces[0].sourceLine, kind: "character" });
        for (const piece of block.pieces.slice(fit)) place(piece);
        continue;
      }
      closePage();
    }

    // Overflowing block (longer than a page): fill line by line.
    let pieces = block.pieces;
    if (count() === 0 && pieces.length > linesPerPage) {
      while (pieces.length > linesPerPage) {
        for (const piece of pieces.slice(0, linesPerPage)) place(piece);
        closePage();
        pieces = pieces.slice(linesPerPage);
      }
      for (const piece of pieces) place(piece);
      continue;
    }
    if (count() > 0) {
      // Re-check after a close: sb applies only when not at top.
      const sbNow = count() === 0 ? 0 : (SPACE_BEFORE[block.kind] || 0);
      if (count() + sbNow + pieces.length > linesPerPage) {
        // Block alone exceeds the rest of a fresh page? Only possible when it
        // is longer than a page; handled above. Otherwise start a new page.
        closePage();
      } else {
        placeBlanks(sbNow);
      }
    }
    if (count() === 0 && pieces.length > linesPerPage) {
      while (pieces.length > linesPerPage) {
        for (const piece of pieces.slice(0, linesPerPage)) place(piece);
        closePage();
        pieces = pieces.slice(linesPerPage);
      }
    }
    for (const piece of pieces) place(piece);
  }
  if (count() > 0 || pages.length === 0) closePage();

  const result = pages.map((page) => ({
    page: page.number,
    startLine: page.sourceLines.length ? Math.min(...page.sourceLines) : 0,
    endLine: page.sourceLines.length ? Math.max(...page.sourceLines) : 0,
    lineCount: page.lines.length,
    lines: page.lines,
  }));
  return {
    linesPerPage,
    lineCount: lines.length,
    renderedLineCount: result.reduce((a, p) => a + p.lineCount, 0),
    pages: result,
  };
}

export function estimatedMinutes(renderedLineCount, linesPerPage = LINES_PER_PAGE) {
  return Number((Math.max(0, renderedLineCount) / Math.max(1, linesPerPage)).toFixed(2));
}
