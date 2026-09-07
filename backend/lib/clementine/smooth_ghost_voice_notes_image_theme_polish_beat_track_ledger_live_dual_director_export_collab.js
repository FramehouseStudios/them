// Smooth ghost voice notes image theme polish beat track ledger live dual director export collab — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExport } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export.js";
import { applyCollabEdits, transformEdit } from "./collab_edit.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollab({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExport({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const edits = Array.isArray(collabEdits) && collabEdits.length ? collabEdits : [{ page: scene || 1, line: 1, character: character || "John", newText: fountain.split("\n")[0] || fountain }];
  const collabDraft = applyCollabEdits(fountain, edits);
  const transformed = edits.length > 1 ? transformEdit(fountain, edits[0], edits[1]) : null;
  return { ...base, collabDraft, collabEdits: edits, collabTransformed: transformed, collabSpring: base.spring };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollab };
