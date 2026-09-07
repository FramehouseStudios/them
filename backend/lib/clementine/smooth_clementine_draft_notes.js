// Smooth clementine draft notes — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + beat sheet export + character voice + punchup + draft notes + spring (smooth amazing, D009) — samantha is clementine — concise branch continues mega chain
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplotBeatVoice } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab_inspector_flip_clementine_writer_polish_ghost_coverage_theme_image_subplot_beat_voice.js";
import { buildDraftNotes } from "./draft_notes.js";

export function buildSmoothClementineDraftNotes({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolishGhostCoverageThemeImageSubplotBeatVoice({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const seqs = base.throughline || [];
  const craft = base.craftSequence?.craft;
  const draftNotes = buildDraftNotes({ draft: fountain, sequences: seqs, craft });
  return { ...base, draftNotes: draftNotes.notes, draftNotesCount: draftNotes.count, draftPolishChanges: draftNotes.polish.changes, draftSpring: base.spring, samanthaIsClementine: true };
}

export default { buildSmoothClementineDraftNotes };
