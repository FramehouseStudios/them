// Final image echo — payoff pays cost, image echo with scar (screenwriting craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildFinalImageEcho({ openingImage, motif, cost, scar } = {}) {
  const open = trimmed(openingImage) || "INT. BEDROOM - opening, clean";
  const m = trimmed(motif) || "listening shadow";
  const c = trimmed(cost) || "being remembered";
  const s = trimmed(scar) || "second hand missing";
  // payoff: same composition, light changes, meaning flips + scar kept
  const final = `${open} — echo: ${m} returns with ${s}, cost paid: ${c}`;
  return { opening: open, motif: m, cost: c, scar: s, final, echo: `${m} with ${s}` };
}

export function buildPerBeatLoglines({ beats, sequences } = {}) {
  const b = Array.isArray(beats) ? beats : [];
  const s = Array.isArray(sequences) ? sequences : [];
  const out = [];
  const max = Math.max(b.length, s.length, 8);
  for (let i=0;i<max;i++) {
    const beat = b[i] || { title: `Beat ${i+1}` };
    const seq = s[i] || { title: `Seq ${i+1}` };
    out.push({ order: i+1, beat: beat.title||beat, sequence: seq.title||seq, logline: `B${i+1}: ${beat.title||beat} — ${seq.title||seq}` });
  }
  return out;
}

export default { buildFinalImageEcho, buildPerBeatLoglines };
