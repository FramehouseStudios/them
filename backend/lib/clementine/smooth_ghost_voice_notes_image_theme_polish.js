// Smooth ghost voice notes image theme polish — per-scene ghost + voice + notes + image + theme + polish + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageTheme } from "./smooth_ghost_voice_notes_image_theme.js";
import { polishDraft } from "./polish_pass.js";

export function buildSmoothGhostVoiceNotesImageThemePolish({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft } = {}) {
  const base = buildSmoothGhostVoiceNotesImageTheme({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft });
  const polished = polishDraft({ draft: draft || base.payoff, sequences: [{ title: `S${scene}`, setpiece: base.image }] });
  return { ...base, polishedDraft: polished.draft, polishChanges: polished.changes };
}

export default { buildSmoothGhostVoiceNotesImageThemePolish };
