// Theme throughline — statement evolves via want/need per sequence (screenwriting craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildThemeStatement({ want, need, flaw } = {}) {
  const w = trimmed(want) || "prove safe";
  const n = trimmed(need) || "admit fear";
  const f = trimmed(flaw) || "control";
  return `Theme: ${w} vs ${n} — flaw ${f} is armor, not truth`;
}

export function buildThroughline({ sequences, want, need, theme } = {}) {
  const t = trimmed(theme) || buildThemeStatement({ want, need });
  const seqs = Array.isArray(sequences) ? sequences : [];
  return seqs.map((s, idx) => {
    const turn = s.turn || s.title || `Seq ${idx+1}`;
    // theme evolves: early = flaw protects, midpoint = flaw costs, late = need chosen
    let evolution = "flaw protects";
    if (idx >= 3 && idx < 5) evolution = "flaw costs";
    if (idx >= 5) evolution = "need chosen";
    return { seq: s.seq || idx+1, title: s.title || turn, theme: t, evolution, turn };
  });
}

export default { buildThemeStatement, buildThroughline };
