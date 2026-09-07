// Smooth ghost voice notes image theme polish beat track — per-scene ghost + voice + notes + image + theme + polish + beat craft + track changes + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageThemePolishBeat } from "./smooth_ghost_voice_notes_image_theme_polish_beat.js";
import { recordChange } from "./track_changes.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrack({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeat({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone });
  const key = `scene-${scene}-${character}`;
  const change = recordChange({ key, line: scene, from: base.polishedDraft || base.payoff, to: base.polishedDraft || base.payoff });
  return { ...base, trackKey: key, trackChange: change };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrack };
