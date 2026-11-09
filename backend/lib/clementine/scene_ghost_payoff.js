// Scene ghost payoff — per-scene ghost paid at final (writing partner, D009)
import { buildGhostPayoff } from "./ghost_payoff.js";

function trimmed(v){ return String(v||"").trim(); }

export function buildSceneGhostPayoff({ scene, character, ghost, want, need, finalImage } = {}) {
  const s = Math.max(1, Number(scene)||1);
  const payoff = buildGhostPayoff({ character, ghost, want, need, finalImage });
  return { scene: s, ...payoff, logline: `S${s}: ${payoff.payoff}` };
}

export function trackSceneGhostPayoffs({ scenes, finalImage } = {}) {
  const arr = Array.isArray(scenes) ? scenes : [];
  return arr.map(s=> buildSceneGhostPayoff({ scene: s.seq || s.scene, character: s.character, ghost: s.ghost, want: s.want, need: s.need, finalImage }));
}

export default { buildSceneGhostPayoff, trackSceneGhostPayoffs };
