// Legacy line-edit preview adapter. Edit original source spans, never joined
// rendered pages. Ambiguous wrapped / generated lines fail closed.
import { paginateScreenplay, classifyLines } from "../screenplay_pagination.js";
import { splitFountainDocument } from "../fountain_import.js";
import { paginateFountainDraft } from "./page_flip.js";

function findEditableLine(draft, { page, line, character } = {}) {
  if (typeof draft !== "string") throw new Error("draft required");
  const layout = paginateScreenplay(draft);
  const p = Number(page);
  const row = Number(line);
  if (!Number.isInteger(p) || !Number.isInteger(row) || p < 1 || row < 1) throw new Error("exact page and line required");
  const selected = layout.pages[p - 1];
  const sourceLine = selected?.sourceLineMap[row - 1];
  if (!sourceLine) throw new Error("line is absent or generated; select an original source line");
  const appearances = layout.pages.flatMap(page => page.sourceLineMap).filter(value => value === sourceLine).length;
  if (appearances !== 1) throw new Error("wrapped source line is ambiguous; select it in the editor");
  const physical = [...draft.matchAll(/([^\r\n\u0085\u2028\u2029]*)(\r\n|[\r\n\u0085\u2028\u2029]|$)/gu)];
  const source = physical[sourceLine - 1];
  const name = String(character ?? "").trim();
  if (name) {
    const document = splitFountainDocument(draft);
    const lines = document.scriptText.replace(/\r\n?|[\u0085\u2028\u2029]/gu, "\n").split("\n");
    const kinds = classifyLines(lines);
    let index = sourceLine - 1 - document.documentLineOffset;
    if (!["dialogue", "parenthetical"].includes(kinds[index])) throw new Error("line is not dialogue for that character");
    while (index >= 0 && ["dialogue", "parenthetical"].includes(kinds[index])) index -= 1;
    if (kinds[index] !== "character" || lines[index].trim().toUpperCase() !== name.toUpperCase()) throw new Error("character does not own this line");
  }
  return { p, row, source, sourceLine, pages: layout.pages };
}

export function applyChessEdit(draft, edit = {}) {
  if (typeof edit.newText !== "string" || !edit.newText.trim() || /[\r\n\u0085\u2028\u2029]/u.test(edit.newText)) {
    throw new Error("one non-empty replacement line required");
  }
  const { p, row, source, sourceLine } = findEditableLine(draft, edit);
  const before = source[1];
  const newDraft = draft.slice(0, source.index) + edit.newText + draft.slice(source.index + before.length);
  const pages = paginateFountainDraft(newDraft);
  return { newDraft, patch: { page: p, line: row, sourceLine, character: String(edit.character ?? "").trim() || null, before, after: edit.newText }, pages, totalPages: pages.length };
}

// Repository-wide import audit: this adapter has no production caller. Do not
// revive its old in-place version overwrite / unscoped memory mutation. A future
// voice-edit integration must use the authenticated, versioned mutation route.
export async function chessEditAndSave() {
  throw new Error("legacy chess persistence disabled; use the authenticated versioned project save route");
}

export default { applyChessEdit, chessEditAndSave, findEditableLine, paginateFountainDraft };
