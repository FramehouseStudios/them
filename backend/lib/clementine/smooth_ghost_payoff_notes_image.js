// Smooth ghost payoff notes image — per-scene ghost payoff + notes + image echo with scar + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotes } from "./smooth_ghost_voice_notes.js";
import { buildImageEcho } from "./image_echo.js";

export function buildSmoothGhostPayoffNotesImage({ scene, character, ghost, want, need, motif, scar, finalImage, lexicon, draft } = {}) {
  const base = buildSmoothGhostVoiceNotes({ scene, character, ghost, want, need, motif, scar, finalImage, lexicon, draft });
  const img = buildImageEcho({ scene: scene || 1, motif: motif || "listening shadow", scar: scar || "second hand missing" });
  return { ...base, image: img.image, imageEcho: img.image, scar: img.scar };
}

export default { buildSmoothGhostPayoffNotesImage };
