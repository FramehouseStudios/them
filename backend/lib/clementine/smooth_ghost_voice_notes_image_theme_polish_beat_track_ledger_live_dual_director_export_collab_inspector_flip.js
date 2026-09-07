// Smooth ghost voice notes image theme polish beat track ledger live dual director export collab inspector flip — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspector } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab_inspector.js";
import { buildPageFlipPayload, paginateFountainDraft } from "./page_flip.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlip({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspector({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const pages = paginateFountainDraft(fountain, { linesPerPage: 55 });
  const flip = buildPageFlipPayload({ project: project || { id: `scene-${scene||1}` }, draft: fountain, currentPage: scene || 1 });
  return { ...base, flipPages: pages, flip, flipTotalPages: flip.totalPages, flipSpring: base.spring, linesPerPage: 55 };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlip };
