// Smooth ghost voice notes image theme polish beat track ledger live dual director export collab inspector flip clementine writer polish — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + spring (smooth amazing, D009) — samantha is clementine
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriter } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab_inspector_flip_clementine_writer.js";
import { polishActionLine } from "./prose_polish.js";
import { buildSubtext, analyzeStatus } from "./dialogue_subtext.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolish({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriter({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const firstAction = fountain.split("\n").find(l=> l.trim() && !l.trim().startsWith("INT.") && !l.trim().startsWith("EXT.") && !/^[A-Z ]+$/.test(l.trim())) || fountain.split("\n")[0] || "";
  const prose = polishActionLine({ line: firstAction, motif: motif||"listening shadow", imageEcho: scar||"second hand missing" });
  const status = analyzeStatus({ line: dialogueLine || "Please stay.", character });
  const sub = buildSubtext({ line: dialogueLine || "Please stay.", character, status });
  return { ...base, prosePolish: prose, dialogueSubtext: sub, subtextStatus: status, polishSpring: base.spring };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementineWriterPolish };
