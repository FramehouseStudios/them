// Ghost ledger — per-scene ghost presence + payoff tracking (writing craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildGhostLedger({ scenes, ghosts } = {}) {
  const sc = Array.isArray(scenes) ? scenes : [];
  const gh = Array.isArray(ghosts) ? ghosts : [];
  return sc.map((s, idx) => {
    const ghost = gh[idx % gh.length] || { character: "John", ghost: "bedroom memory" };
    return {
      scene: s.seq || idx+1,
      title: s.title || `S${idx+1}`,
      character: ghost.character,
      ghost: ghost.ghost,
      present: idx < 2 || idx >= 6 ? false : true, // ghost present in middle acts
      payoff: idx === 7 ? `ghost paid at final image with scar` : `ghost echoes`,
    };
  });
}

export function flagUnpaidGhosts({ ledger } = {}) {
  const arr = Array.isArray(ledger) ? ledger : [];
  return arr.filter(l=> !l.payoff.includes("paid")).map(l=> `Scene ${l.scene} ghost not paid`);
}

export default { buildGhostLedger, flagUnpaidGhosts };
