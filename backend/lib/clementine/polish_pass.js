// Polish pass — tighten draft: active voice, cut hedges, scene craft threading (screenwriting craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function polishDraft({ draft, sequences } = {}) {
  let text = trimmed(draft);
  if (!text) return { draft: "", changes: [] };
  const changes = [];
  // 1. Tighten hedges
  const before = text;
  text = text.replace(/\b(very|really|just|quite|rather|somewhat)\b/gi, "").replace(/\s{2,}/g, " ");
  if (text !== before) changes.push("tighten hedges");
  // 2. Active voice: "was -ing" -> simple past (naive)
  const activeBefore = text;
  text = text.replace(/\b(was|were)\s+(\w+ing)\b/gi, (_, __, verb) => verb.replace(/ing$/, "ed"));
  if (text !== activeBefore) changes.push("active voice");
  // 3. Scene headers: ensure INT./EXT. caps
  const headBefore = text;
  text = text.replace(/^(int|ext)\./gim, (m) => m.toUpperCase());
  if (text !== headBefore) changes.push("heading caps");
  // 4. Sequence threading: if draft thin (<55 lines) and sequences provided, add sequence title comment
  if (Array.isArray(sequences) && sequences.length && text.split("\n").length < 55) {
    const seq = sequences[0];
    if (seq && seq.title) {
      text = `// ${seq.title} - ${seq.setpiece || ""}\n` + text;
      changes.push("sequence header");
    }
  }
  return { draft: text.trim(), changes, beforeLen: before.length, afterLen: text.length };
}

export default { polishDraft };
