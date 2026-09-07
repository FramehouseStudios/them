// Smooth ghost payoff — per-scene ghost payoff with spring animation hint (smooth amazing, D009)
import { buildGhostPayoff } from "./ghost_payoff.js";

function trimmed(v){ return String(v||"").trim(); }

export function buildSmoothGhostPayoff({ scene, character, ghost, want, need, finalImage } = {}) {
  const payoff = buildGhostPayoff({ character, ghost, want, need, finalImage });
  const s = Math.max(1, Number(scene)||1);
  const spring = s === 8 ? 0.9 : s === 4 ? 0.7 : 0.5;
  return { scene: s, ...payoff, spring, haptic: s === 8 ? "heavy" : "light", animation: `spring ${spring}` };
}

export default { buildSmoothGhostPayoff };
