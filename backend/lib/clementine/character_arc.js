// Character arc — per-sequence want/need pressure turn (screenwriting craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildArc({ character, want, need, flaw, ghost, seq = 1, totalSeq = 8 } = {}) {
  const who = trimmed(character) || "John";
  const w = trimmed(want) || "prove safe";
  const n = trimmed(need) || "admit fear";
  const f = trimmed(flaw) || "control";
  const g = trimmed(ghost) || "bedroom memory";
  const s = Math.max(1, Math.min(totalSeq, Number(seq)||1));
  // pressure 0→6 across 8seq (setup 0-1, midpoint 3, late 6)
  const pressure = Math.round(((s-1)/ (totalSeq-1)) * 6);
  let position = "setup";
  if (s >= 4 && s <= 5) position = "midpoint";
  else if (s >= 6) position = "resolution";
  let turn = "protects";
  if (s >= 4 && s < 6) turn = "costs";
  if (s >= 6) turn = "chosen";
  return { character: who, seq: s, totalSeq, want: w, need: n, flaw: f, ghost: g, pressure, position, turn, logline: `S${s}: ${who} ${turn} flaw ${f} want ${w} → need ${n}` };
}

export default { buildArc };
