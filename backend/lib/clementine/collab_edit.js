// Collab paper — 2 writers one page, OT for simultaneous page line edits.
// D009 strangler, no backend/index.js growth.

export function transformEdit(base, a, b) {
  // OT for simultaneous edits: same page+line+character -> b shifts +count, range support
  const aCount = Math.max(1, Number(a.count || a.range || 1));
  const bCount = Math.max(1, Number(b.count || b.range || 1));
  if (a.page===b.page && a.character===b.character) {
    // if ranges overlap or same line, shift b
    const aStart = Number(a.line||1);
    const aEnd = aStart + aCount -1;
    const bStart = Number(b.line||1);
    if (bStart >= aStart && bStart <= aEnd) {
      return { ...b, line: b.line + aCount };
    }
    if (bStart > aEnd) return b;
    if (a.line===b.line) return { ...b, line: b.line+1 };
  }
  return b;
}

// History stack for undo/redo (in-memory per draft, D009)
const _history = new Map(); // draftKey -> [{draft, edit}]
export function pushHistory(key, draft, edit) {
  const k = String(key||"default");
  if (!_history.has(k)) _history.set(k, []);
  _history.get(k).push({ draft, edit, at: Date.now() });
  if (_history.get(k).length > 50) _history.get(k).shift();
}
export function undoHistory(key) {
  const k = String(key||"default");
  const stack = _history.get(k);
  if (!stack || stack.length===0) return null;
  return stack.pop();
}
export function historySize(key) { return (_history.get(String(key||"default"))||[]).length; }

export function applyCollabEdits(draft, edits) {
  // edits: [{page,line,character,newText,count}]
  let cur = draft;
  // OT sequential with transform
  for (let i=0;i<edits.length;i++) {
    const e = edits[i];
    // range: replace count lines starting at line
    const count = Math.max(1, Number(e.count || 1));
    const pages = cur.split("\n\n");
    const pIdx = Math.max(0, Math.min(pages.length-1, (e.page||1)-1));
    const lines = pages[pIdx].split("\n");
    const lIdx = Math.max(0, Math.min(lines.length, (e.line||1)-1));
    if (count === 1) {
      // single line replace (or insert if lIdx === lines.length)
      if (lIdx < lines.length) lines[lIdx] = e.newText;
      else lines.push(e.newText);
    } else {
      // multi-line range replace
      const before = lines.slice(0, lIdx);
      const after = lines.slice(lIdx+count);
      const newLines = String(e.newText||"").split("\n");
      lines.length = 0;
      lines.push(...before, ...newLines, ...after);
    }
    pages[pIdx] = lines.join("\n");
    cur = pages.join("\n\n");
  }
  return cur;
}
export default { transformEdit, applyCollabEdits };
