// Smooth ghost voice notes image theme polish beat track ledger live dual director export collab inspector flip clementine writer polish ghost coverage theme image subplot beat voice — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + beat sheet export + character voice + dialogue punchup + spring (smooth amazing, D009) — samantha is clementine
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplotBeat } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab_inspector_flip_clementine_writer_polish_ghost_coverage_theme_image_subplot_beat.js";
import { buildCharacterVoice } from "./character_voice.js";
import { punchUpDialogue } from "./dialogue_punchup.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplotBeatVoice({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplotBeat({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const voice = buildCharacterVoice({ character, lexicon, ghost, want });
  const punch = punchUpDialogue({ line: dialogueLine || "Please stay.", character, note: "punch-up tighten" });
  return { ...base, characterVoice: voice, punchUp: punch, voiceSpring: base.spring };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplotBeatVoice };
