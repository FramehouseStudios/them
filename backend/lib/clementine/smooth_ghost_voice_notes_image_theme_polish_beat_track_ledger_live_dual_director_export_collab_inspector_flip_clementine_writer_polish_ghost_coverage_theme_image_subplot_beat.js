// Smooth ghost voice notes image theme polish beat track ledger live dual director export collab inspector flip clementine writer polish ghost coverage theme image subplot beat — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + beat sheet export + spring (smooth amazing, D009) — samantha is clementine
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplot } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab_inspector_flip_clementine_writer_polish_ghost_coverage_theme_image_subplot.js";
import { buildBeatSheet, exportBeatSheetFDX } from "./beat_sheet_export.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplotBeat({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplot({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const beatSheet = buildBeatSheet({ genre: genre||"horror", tone: tone||"dark", totalPages: 90 });
  const beatForScene = beatSheet[Math.min(beatSheet.length-1, Math.max(0, (scene||1)-1))] || beatSheet[0];
  const beatFdx = exportBeatSheetFDX({ beatSheet });
  return { ...base, beatSheet, beatForScene, beatFdx, beatSpring: base.spring };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplotBeat };
