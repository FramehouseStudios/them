// Smooth ghost voice notes image theme — per-scene ghost + voice + notes + image echo + theme + spring (smooth amazing, D009)
import { buildSmoothGhostPayoffNotesImage } from "./smooth_ghost_payoff_notes_image.js";
import { buildThemeStatement } from "./theme_throughline.js";

export function buildSmoothGhostVoiceNotesImageTheme({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft } = {}) {
  const base = buildSmoothGhostPayoffNotesImage({ scene, character, ghost, want, need, motif, scar, finalImage, lexicon, draft });
  const theme = buildThemeStatement({ want, need, flaw });
  return { ...base, theme, flaw: flaw || "control" };
}

export default { buildSmoothGhostVoiceNotesImageTheme };
