// Smooth ghost voice notes image theme polish beat track ledger live dual director — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDual } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual.js";
import { buildCommentary } from "./director_commentary.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirector({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDual({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const commentary = buildCommentary({ project: project || { characterContexts: [{name: character||"John"}] }, draft: fountain, page: scene || 1, line: scene || 1 });
  return { ...base, director: commentary, directorNotes: commentary.notes, directorX: commentary.xCommentary };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirector };
