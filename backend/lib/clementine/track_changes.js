// Track changes — per-line rewrite history (writing craft, D009)
function trimmed(v){ return String(v||"").trim(); }

const history = new Map(); // key -> [{line, from, to, at}]

export function recordChange({ key, line, from, to } = {}) {
  const k = trimmed(key) || "default";
  const entry = { line: Number(line)||0, from: trimmed(from), to: trimmed(to), at: Date.now() };
  if (!history.has(k)) history.set(k, []);
  history.get(k).push(entry);
  if (history.get(k).length > 100) history.get(k).shift();
  return entry;
}

export function getChanges({ key } = {}) {
  const k = trimmed(key) || "default";
  return [...(history.get(k) || [])];
}

export function revertChange({ key, line } = {}) {
  const k = trimmed(key) || "default";
  const arr = history.get(k) || [];
  const idx = arr.findIndex(e=> e.line === Number(line));
  if (idx === -1) return null;
  return arr[idx];
}

export default { recordChange, getChanges, revertChange };
