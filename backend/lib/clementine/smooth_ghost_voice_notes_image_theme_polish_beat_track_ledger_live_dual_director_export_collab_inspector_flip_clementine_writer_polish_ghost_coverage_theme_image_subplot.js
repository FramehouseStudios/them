// Smooth ghost voice notes image theme polish beat track ledger live dual director export collab inspector flip clementine writer polish ghost coverage theme image subplot — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + spring (smooth amazing, D009) — samantha is clementine
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImage } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab_inspector_flip_clementine_writer_polish_ghost_coverage_theme_image.js";
import { buildSubplot } from "./subplot_thread.js";
import { buildRewriteNotes } from "./rewrite_notes.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplot({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImage({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const subplot = buildSubplot({ characters: ["Sam"], motif: motif||"listening shadow", totalPages: 90 });
  const subplotForScene = subplot[Math.min(subplot.length-1, Math.max(0, (scene||1)-1))] || subplot[0];
  const rewrite = buildRewriteNotes({ draft: fountain, sequences: subplot, craft: base.craftSequence?.craft });
  return { ...base, subplot, subplotForScene, rewriteNotes: rewrite.notes, rewriteCount: rewrite.count, subplotSpring: base.spring };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplot };
