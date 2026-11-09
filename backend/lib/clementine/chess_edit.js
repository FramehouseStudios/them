// Chess-smart line edit: address page 25, line 4 by John → change + save + auto-fix in real time.
// Like chess engine: evaluate board after move, fix continuity/format simultaneously.
// D009 strangler, no backend/index.js growth.

import { paginateFountainDraft } from "./page_flip.js";
import { pushCharacterMemory, getCharacterContext } from "./short_film_character_context.js";

function trimToString(v){ return v==null?"":String(v).trim(); }

function findEditableLine(draft, { page, line, character } = {}) {
  const pages = paginateFountainDraft(draft);
  const p = Math.max(1, Math.min(pages.length||1, Number(page)||1));
  const pageText = pages[p-1] || "";
  const lines = pageText.split("\n");
  const targetIdx = Math.max(0, Math.min(lines.length-1, (Number(line)||1)-1));
  const char = trimToString(character);
  // If character given, verify line belongs to that character header block
  if (char) {
    const headerIdx = lines.findIndex(l=> l.trim().toUpperCase()===char.toUpperCase());
    if (headerIdx>=0) {
      // line offset relative to header: header + 1 is dialogue
      const absIdx = headerIdx + 1 + targetIdx;
      // but for page-level, we simplify: line is absolute within page
    }
  }
  return { pages, p, pageText, lines, targetIdx, lineText: lines[targetIdx]||"" };
}

// Pure: apply edit to draft string, return new draft and patch meta
export function applyChessEdit(draft, { page, line, character, newText } = {}) {
  const txt = trimToString(newText);
  if (!txt) throw new Error("newText required");
  const { pages, p, lines, targetIdx } = findEditableLine(draft, { page, line, character });
  const before = lines[targetIdx];
  lines[targetIdx] = txt;
  pages[p-1] = lines.join("\n");
  const newDraft = pages.join("\n\n");
  return {
    newDraft,
    patch: { page: p, line: targetIdx+1, character: trimToString(character)||null, before, after: txt },
    pages,
    totalPages: pages.length,
  };
}

// Apply + persist + auto-fix (format continuity) — returns draft + memory update
export async function chessEditAndSave({ project, draft, edit, commitScreenplayOwnerMutation } = {}) {
  if (!project) throw new Error("project required");
  if (!edit) throw new Error("edit required");
  const { newDraft, patch, totalPages } = applyChessEdit(draft, edit);

  // Push to per-character memory (chess: evaluate after move)
  try {
    if (edit.character) {
      pushCharacterMemory(project, { name: edit.character, text: edit.newText, page: edit.page, role: "edit" });
    }
  } catch {}

  // Quick auto-fix: if edit breaks Fountain caps, normalize character header to uppercase
  let fixedDraft = newDraft;
  try {
    if (edit.character && fixedDraft.includes(edit.character)) {
      const up = String(edit.character).toUpperCase();
      if (edit.character !== up) fixedDraft = fixedDraft.split(edit.character).join(up);
    }
  } catch {}

  // Persist via commitScreenplayOwnerMutation if provided (real-time save)
  if (typeof commitScreenplayOwnerMutation === "function" && project.id) {
    const ownerKey = project.ownerKey || "";
    if (ownerKey) {
      await commitScreenplayOwnerMutation({
        ownerKey,
        mutate: (owner) => {
          const proj = (owner.projects||[]).find(pl=> String(pl.id)===String(project.id));
          if (!proj) return { commit:false };
          // mirror edit into persisted draft (latest version)
          if (!Array.isArray(proj.versions)) proj.versions=[];
          if (proj.versions[0]) proj.versions[0].draft = fixedDraft;
          else proj.versions.push({ id:`v_${Date.now()}`, draft: fixedDraft, page: edit.page });
          if (edit.character) {
            try { pushCharacterMemory(proj, { name: edit.character, text: edit.newText, page: edit.page, role:"edit" }); } catch {}
          }
          proj.updatedAt = Date.now();
          owner.updatedAt = Date.now();
          return { commit:true };
        }
      });
    }
  }

  return { draft: fixedDraft, patch, totalPages, projectId: String(project.id||"") };
}

export default { applyChessEdit, chessEditAndSave, findEditableLine, paginateFountainDraft };
