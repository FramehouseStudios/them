// Smooth ghost voice notes image theme polish beat — per-scene ghost + voice + notes + image + theme + polish + beat craft + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageThemePolish } from "./smooth_ghost_voice_notes_image_theme_polish.js";
import { assignCraftPerBeat } from "./beat_craft.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeat({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolish({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft });
  const beats = assignCraftPerBeat({ genre: genre || "horror", tone: tone || "dark" });
  const beat = beats[(scene-1)*5] || beats[0];
  return { ...base, beat: beat.beat, beatCraft: beat.craft, beatTitle: beat.title, beatPage: beat.page };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeat };
