// Writer learning — how user writes, how to help them write better (partner learning, D009)
function trimmed(v){ return String(v||"").trim(); }

const profiles = new Map(); // ownerKey -> { hedges, passive, avgLen, favMotif, corrections: [] }

function analyzeDraft(draft) {
  const text = String(draft||"");
  const hedges = (text.match(/\b(very|really|just|quite|rather)\b/gi) || []).length;
  const passive = (text.match(/\b(was|were)\s+\w+ing\b/gi) || []).length;
  const lines = text.split("\n").filter(l=> l.trim());
  const avgLen = lines.length ? Math.round(lines.reduce((s,l)=> s+l.length,0)/lines.length) : 0;
  const motifHits = (text.match(/listening shadow|shadow|bedroom/gi) || []).length;
  return { hedges, passive, avgLen, motifHits, lines: lines.length };
}

export function learnFromDraft({ ownerKey, draft, motif } = {}) {
  const k = trimmed(ownerKey) || "default";
  const a = analyzeDraft(draft);
  if (!profiles.has(k)) profiles.set(k, { hedges: 0, passive: 0, avgLen: 0, favMotif: trimmed(motif) || "listening shadow", corrections: [], drafts: 0 });
  const p = profiles.get(k);
  p.hedges = Math.round((p.hedges * p.drafts + a.hedges) / (p.drafts + 1));
  p.passive = Math.round((p.passive * p.drafts + a.passive) / (p.drafts + 1));
  p.avgLen = Math.round((p.avgLen * p.drafts + a.avgLen) / (p.drafts + 1));
  if (a.motifHits > 1) p.favMotif = trimmed(motif) || p.favMotif;
  p.drafts += 1;
  // how to help: targeted suggestion based on learned pattern
  const suggestions = [];
  if (p.hedges > 2) suggestions.push("tighten hedges (you often use very/really)");
  if (p.passive > 1) suggestions.push("active voice (you often was -ing)");
  if (p.avgLen > 80) suggestions.push("shorten lines (your avg is long)");
  if (suggestions.length) p.corrections = suggestions;
  return { ...p, latest: a, suggestions };
}

export function getWriterProfile(ownerKey) {
  const k = trimmed(ownerKey) || "default";
  return profiles.get(k) || { hedges: 0, passive: 0, avgLen: 0, favMotif: "listening shadow", corrections: [], drafts: 0 };
}

export function suggestForWriter({ ownerKey, draft } = {}) {
  const p = getWriterProfile(ownerKey);
  if (p.corrections.length) return `Clementine noticed you often ${p.corrections[0]} — want me to polish this draft that way?`;
  return "";
}

export default { learnFromDraft, getWriterProfile, suggestForWriter };
