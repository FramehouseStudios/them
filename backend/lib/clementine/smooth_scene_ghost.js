// Smooth scene ghost — per-scene ghost + image + spring + haptics (smooth amazing, D009)
import { buildSceneGhostImage } from "./scene_ghost_image.js";
import { buildSmoothGhostPayoff } from "./smooth_ghost_payoff.js";

export function buildSmoothSceneGhost({ scene, character, ghost, want, need, motif, scar, finalImage } = {}) {
  const base = buildSceneGhostImage({ scene, character, ghost, want, need, motif, scar, finalImage });
  const smooth = buildSmoothGhostPayoff({ scene, character, ghost, want, need, finalImage });
  return { ...base, spring: smooth.spring, haptic: smooth.haptic, animation: smooth.animation };
}

export default { buildSmoothSceneGhost };
