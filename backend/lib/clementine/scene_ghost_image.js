// Scene ghost image — per-scene ghost + image echo (writing craft, D009)
import { buildGhostPayoff } from "./ghost_payoff.js";
import { buildImageEcho } from "./image_echo.js";

function trimmed(v){ return String(v||"").trim(); }

export function buildSceneGhostImage({ scene, character, ghost, want, need, motif, scar, finalImage } = {}) {
  const s = Math.max(1, Number(scene)||1);
  const payoff = buildGhostPayoff({ character, ghost, want, need, finalImage });
  const img = buildImageEcho({ scene: s, motif: motif || "listening shadow", scar: scar || "second hand missing" });
  return { scene: s, character: payoff.character, ghost: payoff.ghost, payoff: payoff.payoff, image: img.image, imageEcho: img.image, paid: payoff.paid };
}

export default { buildSceneGhostImage };
