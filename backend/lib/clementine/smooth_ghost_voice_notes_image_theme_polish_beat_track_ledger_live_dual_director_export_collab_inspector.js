// Smooth ghost voice notes image theme polish beat track ledger live dual director export collab inspector — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollab } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab.js";
import { buildInspectorTabState } from "./inspector_ux.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspector({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollab({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits });
  const inspector = buildInspectorTabState({ selectedTab: tab || "editor", provenance: provenance || "clementine", history: [provenance || "clementine"], studioAction: { type: "openStudio", tab: tab || "editor" } });
  return { ...base, inspector, inspectorTab: inspector.selectedTab, inspectorProvenance: inspector.provenance, inspectorSpring: base.spring };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspector };
