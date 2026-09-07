// Smooth ghost voice notes image theme polish beat track ledger — per-scene ghost + voice + notes + image + theme + polish + beat craft + track changes + ledger + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrack } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track.js";
import { buildGhostLedger } from "./ghost_ledger.js";
import { trackMotif } from "./image_ledger.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedger({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrack({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone });
  const ledger = buildGhostLedger({ scenes: [{ seq: scene, title: `S${scene}` }], ghosts: [{ character: character || "John", ghost: ghost || "bedroom memory" }] });
  const motifTrack = trackMotif({ draft: base.polishedDraft || draft || base.payoff || "", motif: motif || "listening shadow", sequences: [{ seq: scene, title: `S${scene}` }] });
  return { ...base, ghostLedger: ledger[0] || null, motifTrack, ledgerSpring: base.spring };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedger };
