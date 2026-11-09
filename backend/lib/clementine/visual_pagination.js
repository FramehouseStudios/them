// Visual pagination — element-aware printed pages (55 lines) + FDX hook.
// D009 strangler under lib/clementine; backend/index.js stays at 33626.
// Wraps page_flip.paginateFountainDraft with OpenDraft element-aware line
// counting so printed pages never split mid-element, plus an FDX export hook.

import { paginateFountainDraft } from "./page_flip.js";
import { exportToFDX } from "../fdx_export.js";

export const LINES_PER_PAGE = 55;

// OpenDraft-interop element kinds (mirrors Fountain/FDX canonical shape +
// the OpenDraft bounded reference in docs/opendraft-intake.md).
export const ELEMENT_KINDS = Object.freeze([
  "heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "centered",
  "lyrics",
  "section",
  "synopsis",
  "blank",
]);

function toStringDraft(draft) {
  if (draft === null || draft === undefined) return "";
  if (typeof draft === "string") return draft;
  // structured screenplay object -> fall back to JSON-ish string for pagination
  // caller should pass Fountain text for accurate element boundaries
  try { return String(draft); } catch { return ""; }
}

function splitIntoBlocks(text) {
  // Element-aware: respect Fountain element boundaries.
  // - Scene headings (INT./EXT.) are standalone blocks.
  // - Character cue + parenthetical + dialogue stay together as one block.
  // - Otherwise each non-blank line group split by blank lines is a block,
  //   but single-newline separated action lines are also split per-line so
  //   line-count pagination is accurate for plain drafts.
  const rawLines = text.split("\n");
  const blocks = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();
    if (trimmed === "") { i++; continue; }
    const isHeading = /^(INT\.|EXT\.|INT\/EXT|EST\.)/i.test(trimmed) || /^\./.test(trimmed);
    if (isHeading) {
      blocks.push(line);
      i++;
      continue;
    }
    const isCharacterCue = /^[A-Z][A-Z0-9 .'-]*$/.test(trimmed) && trimmed === trimmed.toUpperCase() && trimmed.length >= 2 && !trimmed.includes(":") && trimmed.length < 40 && !/^(INT\.|EXT\.)/.test(trimmed);
    if (isCharacterCue) {
      const group = [line];
      i++;
      // absorb parenthetical and dialogue lines that follow without blank line
      while (i < rawLines.length) {
        const nxt = rawLines[i];
        const nt = nxt.trim();
        if (nt === "") break;
        if (/^(INT\.|EXT\.|INT\/EXT|EST\.)/i.test(nt) || /^\./.test(nt)) break;
        // if next looks like a new character cue, stop
        if (/^[A-Z][A-Z0-9 .'-]*$/.test(nt) && nt === nt.toUpperCase() && nt.length >=2 && nt.length < 40 && !nt.startsWith("(")) {
          // could be next character; peek if following line is dialogue-like? keep simple: break if upper
          // but only break if we already have dialogue
          if (group.length >= 2) break;
        }
        // parenthetical or dialogue
        group.push(nxt);
        i++;
        // dialogue block typically 1-3 lines; stop after blank or heading
        if (group.length >= 4) break;
      }
      blocks.push(group.join("\n"));
      continue;
    }
    // For non-character lines without blank separators, treat consecutive
    // non-blank, non-heading, non-character lines as individual blocks
    // when they are single-line action lines (plain draft).
    // If text used blank-line separators, group consecutive lines as one block.
    // Heuristic: if surrounding context has blank lines, respect them; else per-line.
    const hasBlankSeparated = text.includes("\n\n");
    if (!hasBlankSeparated) {
      blocks.push(line);
      i++;
    } else {
      // blank-separated mode: group consecutive non-blank lines
      const group = [line];
      i++;
      while (i < rawLines.length) {
        const nxt = rawLines[i];
        const nt = nxt.trim();
        if (nt === "") break;
        if (/^(INT\.|EXT\.|INT\/EXT|EST\.)/i.test(nt) || /^\./.test(nt)) break;
        if (/^[A-Z][A-Z0-9 .'-]*$/.test(nt) && nt === nt.toUpperCase() && nt.length >=2 && nt.length < 40) break;
        group.push(nxt);
        i++;
      }
      blocks.push(group.join("\n"));
    }
  }
  return blocks.filter(Boolean);
}

function countBlockLines(block) {
  // Printed line count: one per newline within block, plus wrapped lines for
  // long action/dialogue (> 60 chars ~ one extra printed line). Keeps cost
  // conservative without a full word-wrap engine.
  const lines = block.split("\n");
  let count = 0;
  for (const l of lines) {
    const len = l.length;
    if (len <= 61) count += 1;
    else count += Math.ceil(len / 61);
  }
  return Math.max(1, count);
}

export function paginateVisualDraft(draft, { linesPerPage = LINES_PER_PAGE } = {}) {
  const text = toStringDraft(draft);
  if (!text.trim()) return [];
  const perPage = Math.max(1, Number(linesPerPage) || LINES_PER_PAGE);

  // If input looks like structured screenplay object with scenes, delegate
  // to element-counted path using same 55-line budget.
  if (draft && typeof draft === "object" && !Array.isArray(draft) && Array.isArray(draft.scenes)) {
    return paginateStructuredScreenplay(draft, perPage);
  }

  const blocks = splitIntoBlocks(text);
  // If no meaningful blocks (e.g., single paragraph), fallback to page_flip
  if (blocks.length === 0) return paginateFountainDraft(text, { linesPerPage: perPage });

  const pages = [];
  let curLines = 0;
  let curBlocks = [];
  for (const block of blocks) {
    const blockLines = countBlockLines(block);
    // If single block exceeds page, split it via page_flip fallback on that block
    if (blockLines > perPage) {
      if (curBlocks.length) {
        pages.push(curBlocks.join("\n\n"));
        curBlocks = [];
        curLines = 0;
      }
      const subPages = paginateFountainDraft(block, { linesPerPage: perPage });
      for (let i = 0; i < subPages.length; i++) {
        // first subpage starts new page, rest are pages themselves
        if (i === 0) {
          curBlocks.push(subPages[i]);
          curLines = countBlockLines(subPages[i]);
          if (curLines >= perPage) {
            pages.push(curBlocks.join("\n\n"));
            curBlocks = [];
            curLines = 0;
          }
        } else {
          if (curBlocks.length) {
            pages.push(curBlocks.join("\n\n"));
            curBlocks = [];
            curLines = 0;
          }
          pages.push(subPages[i]);
        }
      }
      continue;
    }
    if (curLines + blockLines > perPage && curBlocks.length > 0) {
      pages.push(curBlocks.join("\n\n"));
      curBlocks = [block];
      curLines = blockLines;
    } else {
      curBlocks.push(block);
      curLines += blockLines;
    }
  }
  if (curBlocks.length) pages.push(curBlocks.join("\n\n"));
  return pages.filter(Boolean);
}

function paginateStructuredScreenplay(screenplay, perPage) {
  // Count per-element lines using ELEMENT_KINDS-aware weights
  const scenes = Array.isArray(screenplay.scenes) ? screenplay.scenes : [];
  const blocks = [];
  for (const scene of scenes) {
    if (scene.heading) blocks.push({ text: String(scene.heading).toUpperCase(), lines: 1 });
    const lines = Array.isArray(scene.lines) ? scene.lines : [];
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      switch (line.kind) {
        case "action": {
          const t = String(line.text || "");
          blocks.push({ text: t, lines: Math.max(1, Math.ceil(t.length / 61) || 1) });
          break;
        }
        case "character": {
          let n = 1;
          if (line.parenthetical) n += 1;
          const dialogue = Array.isArray(line.dialogue) ? line.dialogue.join(" ") : String(line.dialogue || "");
          n += Math.max(1, Math.ceil(dialogue.length / 61) || 1);
          const name = String(line.name || "").toUpperCase();
          const parenthetical = line.parenthetical ? `(${String(line.parenthetical).replace(/^\(|\)$/g,"")})` : "";
          const text = [name, parenthetical, dialogue].filter(Boolean).join("\n");
          blocks.push({ text, lines: n });
          break;
        }
        case "transition": blocks.push({ text: String(line.text || ""), lines: 1 }); break;
        case "centered": blocks.push({ text: String(line.text || ""), lines: 1 }); break;
        case "lyrics": blocks.push({ text: String(line.text || ""), lines: 1 }); break;
        case "section": blocks.push({ text: `# ${String(line.text||"")}`, lines: 1 }); break;
        case "synopsis": blocks.push({ text: `= ${String(line.text||"")}`, lines: 1 }); break;
        default: break;
      }
    }
  }
  if (blocks.length === 0) return [];
  const pages = [];
  let cur = [];
  let curLines = 0;
  for (const b of blocks) {
    if (curLines + b.lines > perPage && cur.length) {
      pages.push(cur.join("\n\n"));
      cur = [b.text];
      curLines = b.lines;
    } else {
      cur.push(b.text);
      curLines += b.lines;
    }
  }
  if (cur.length) pages.push(cur.join("\n\n"));
  return pages.filter(Boolean);
}

export function buildVisualPaperPayload({ project, draft, currentPage = 1 } = {}) {
  // Element-aware wrapper around page_flip's paginateFountainDraft
  const rawDraft = draft !== undefined ? draft : project?.versions?.[0]?.draft || project?.latestDraft || "";
  const pages = paginateVisualDraft(rawDraft, { linesPerPage: LINES_PER_PAGE });
  const totalPages = Math.max(1, pages.length || 1);
  const cur = Math.max(1, Math.min(totalPages, Number(currentPage) || 1));
  return {
    totalPages,
    currentPage: cur,
    pageText: pages[cur - 1] || "",
    pages,
    hasNext: cur < totalPages,
    hasPrev: cur > 1,
    projectId: String(project?.id || ""),
    logline: String(project?.logline || "").slice(0, 280),
    linesPerPage: LINES_PER_PAGE,
  };
}

// FDX hook — produce Final Draft XML for the (optionally paginated) screenplay.
// Accepts either a structured screenplay object or a Fountain string draft.
// Pure: same input -> same output.
export function exportVisualFDX(screenplayOrDraft, opts = {}) {
  if (typeof screenplayOrDraft === "string") {
    // Fountain string -> minimal screenplay shape for FDX export.
    // Split by headings into scenes so page count is preserved as scenes.
    const text = screenplayOrDraft;
    const pages = paginateVisualDraft(text, { linesPerPage: opts.linesPerPage || LINES_PER_PAGE });
    // Build a tiny screenplay that round-trips through exportToFDX.
    // If paginated, first page is used for export; pagination metadata is
    // kept in opts for callers that need page-aware FDX.
    const draftToUse = opts.paginated ? pages.join("\n\n") : text;
    const headers = [...draftToUse.matchAll(/^(INT\.|EXT\.)[^\\n]*$/gmi)];
    if (headers.length === 0) {
      return exportToFDX({ scenes: [{ lines: [{ kind: "action", text: draftToUse }] }] });
    }
    const scenes = [];
    for (let i = 0; i < headers.length; i++) {
      const start = headers[i].index;
      const end = headers[i+1] ? headers[i+1].index : draftToUse.length;
      const chunk = draftToUse.slice(start, end).trim();
      const lines = chunk.split("\n");
      const heading = lines[0] || "";
      const body = lines.slice(1).join("\n").trim();
      scenes.push({ heading, lines: body ? [{ kind: "action", text: body }] : [] });
    }
    return exportToFDX({ scenes });
  }
  // Structured screenplay object
  return exportToFDX(screenplayOrDraft);
}

// Backwards-compat alias used by some callers
export const paginateFountainVisual = paginateVisualDraft;

export default {
  LINES_PER_PAGE,
  ELEMENT_KINDS,
  paginateVisualDraft,
  paginateFountainVisual,
  buildVisualPaperPayload,
  exportVisualFDX,
};
