// Smooth ghost voice notes image theme polish beat track ledger live — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedger } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger.js";
import { buildLivePaperPayload } from "./studio_live_paper.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLive({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedger({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone });
  const livePaper = buildLivePaperPayload(project || { logline: want || "", synopsis: need || "", beats: [] }, { draft: base.polishedDraft || draft || base.payoff || "", currentPage: scene || 1 });
  return { ...base, livePaper, livePages: livePaper.pages || [], liveTotalPages: livePaper.totalPages || 0 };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLive };
