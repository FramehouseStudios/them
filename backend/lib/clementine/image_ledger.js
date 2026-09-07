// Image ledger — motif tracking per sequence (screenwriting craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function trackMotif({ draft, motif, sequences } = {}) {
  const m = trimmed(motif) || "listening shadow";
  const text = String(draft||"");
  const seqs = Array.isArray(sequences) ? sequences : [];
  const counts = [];
  // split draft by sequences via pageStart (approx lines/seq)
  const lines = text.split("\n");
  const perSeq = seqs.length ? Math.ceil(lines.length / seqs.length) : lines.length;
  for (let i=0;i<seqs.length;i++) {
    const chunk = lines.slice(i*perSeq, (i+1)*perSeq).join("\n").toLowerCase();
    const c = (chunk.match(new RegExp(m.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    counts.push({ seq: seqs[i].seq || i+1, title: seqs[i].title || `S${i+1}`, count: c, missing: c===0 });
  }
  const missing = counts.filter(c=>c.missing);
  const notes = [];
  if (missing.some(c=>c.seq===4)) notes.push("Motif missing at Midpoint seq4 p45 — add imageEcho listening shadow");
  if (missing.length > 2) notes.push(`Motif thin overall ${counts.reduce((s,c)=>s+c.count,0)} hits — thread per scene`);
  return { motif: m, counts, missing, notes, total: counts.reduce((s,c)=>s+c.count,0) };
}

export default { trackMotif };
