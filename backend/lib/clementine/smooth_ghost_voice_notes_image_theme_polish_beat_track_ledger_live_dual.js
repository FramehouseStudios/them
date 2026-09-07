// Smooth ghost voice notes image theme polish beat track ledger live dual — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLive } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live.js";
import { paginateVisualDraft } from "./visual_pagination.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDual({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLive({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const pages = paginateVisualDraft(fountain);
  const dual = { draft: fountain, pages, totalPages: pages.length, conversationWhileWriting: `Sam listens while ${character||"John"} writes S${scene||1} — "${motif||"listening shadow"}" threads`, streaming: true };
  return { ...base, dual, dualPages: pages, dualTotalPages: pages.length, dualStreaming: true };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDual };
