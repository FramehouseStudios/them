// Rewrite notes — studio notes for draft (screenwriting craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildRewriteNotes({ draft, sequences, craft } = {}) {
  const text = trimmed(draft);
  const notes = [];
  if (!text) notes.push("No draft — start with INT. BEDROOM");
  if (text && !/^(INT\.|EXT\.)/m.test(text)) notes.push("Add heading: INT./EXT. so reader can locate");
  if (text.split("\n").length < 20) notes.push("Expand: thin — add per-scene want/obstacle/cost 1-8");
  if (Array.isArray(sequences) && sequences.length) {
    const mid = sequences.find(s=> s.seq===4);
    if (mid) notes.push(`Sequence 4 Midpoint ${mid.title}: add setpiece ${mid.setpiece} p${mid.pageStart||45}`);
  }
  if (craft && craft.id) notes.push(`Craft ${craft.id} ${craft.title}: ${trimmed(craft.technique).slice(0,80)}`);
  // polish pass hint
  if (/\bvery\b/i.test(text)) notes.push("Tighten: cut hedge very");
  return { notes, count: notes.length, draftLen: text.length };
}

export default { buildRewriteNotes };
