// Smooth ghost voice notes image theme polish beat track ledger live dual director export collab inspector flip clementine writer polish ghost coverage theme — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + spring (smooth amazing, D009) — samantha is clementine
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverage } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab_inspector_flip_clementine_writer_polish_ghost_coverage.js";
import { buildThemeStatement, buildThroughline } from "./theme_throughline.js";
import { assignCraftPerSequence } from "./sequence_craft_coverage.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageTheme({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverage({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const theme = buildThemeStatement({ want, need, flaw });
  const sequences = Array.from({length:8}, (_,i)=>({seq:i+1, title:`Seq ${i+1}`, turn: i<3?"protects": i<5?"costs":"chosen"}));
  const throughline = buildThroughline({ sequences, want, need, theme });
  const craftSeq = assignCraftPerSequence({ genre: genre||"horror", tone: tone||"dark", totalPages: 90 });
  const seqForScene = craftSeq[Math.min(craftSeq.length-1, Math.max(0, (scene||1)-1))] || craftSeq[0];
  return { ...base, themeStatement: theme, throughline, craftSequence: seqForScene, throughlineSpring: base.spring };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageTheme };
