// Smooth ghost voice notes image theme polish beat track ledger live dual director export collab inspector flip clementine writer polish ghost — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + spring (smooth amazing, D009) — samantha is clementine
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolish } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab_inspector_flip_clementine_writer_polish.js";
import { buildGhostPayoff } from "./ghost_payoff.js";
import { buildGhostPage } from "./ghost_page.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhost({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolish({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const payoff = buildGhostPayoff({ character, ghost, want, need, finalImage });
  const page = buildGhostPage({ character, ghost, want, need, flaw, setting: "bedroom" });
  return { ...base, ghostPayoff: payoff, ghostPage: page, ghostPaid: payoff.paid, ghostSpring: base.spring };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhost };
