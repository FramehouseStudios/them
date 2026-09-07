// Ghost payoff — per-character ghost paid in final image (writing craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildGhostPayoff({ character, ghost, want, need, finalImage } = {}) {
  const who = trimmed(character) || "John";
  const g = trimmed(ghost) || "bedroom memory age 12";
  const w = trimmed(want) || "prove safe";
  const n = trimmed(need) || "admit fear";
  const f = trimmed(finalImage) || "INT. BEDROOM - final echo with scar";
  const payoff = `${who} ghost ${g} — want ${w} paid by need ${n} at final: ${f}`;
  return { character: who, ghost: g, want: w, need: n, finalImage: f, payoff, paid: true };
}

export function trackGhostPayoffs({ characters, finalImage } = {}) {
  const arr = Array.isArray(characters) ? characters : [];
  return arr.map(c=> buildGhostPayoff({ character: c.name || c.character, ghost: c.ghost, want: c.want, need: c.need, finalImage }));
}

export default { buildGhostPayoff, trackGhostPayoffs };
