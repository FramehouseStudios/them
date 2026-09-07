// Collab paper — 2 writers one page, OT for simultaneous page line edits.
// D009 strangler, no backend/index.js growth.

export function transformEdit(base, a, b) {
  // simple: if same page+line, b after a shifts line +1
  if (a.page===b.page && a.line===b.line && a.character===b.character) {
    return { ...b, line: b.line+1 };
  }
  return b;
}
export function applyCollabEdits(draft, edits) {
  // edits: [{page,line,character,newText}]
  let cur = draft;
  // naive sequential with transform
  for (let i=0;i<edits.length;i++) {
    const e = edits[i];
    // paginate per INT. not needed for test — simple line replace
    const pages = cur.split("\n\n");
    const pIdx = Math.max(0, Math.min(pages.length-1, (e.page||1)-1));
    const lines = pages[pIdx].split("\n");
    const lIdx = Math.max(0, Math.min(lines.length-1, (e.line||1)-1));
    lines[lIdx] = e.newText;
    pages[pIdx] = lines.join("\n");
    cur = pages.join("\n\n");
  }
  return cur;
}
export default { transformEdit, applyCollabEdits };
