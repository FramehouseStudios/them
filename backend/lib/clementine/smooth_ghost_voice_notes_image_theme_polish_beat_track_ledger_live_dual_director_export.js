// Smooth ghost voice notes image theme polish beat track ledger live dual director export — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + spring (smooth amazing, D009)
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirector } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director.js";
import { exportAndShare } from "./export_share.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExport({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirector({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const exp = exportAndShare({ project: project || { id: `scene-${scene||1}`, versions: [{draft: fountain}] }, draft: fountain, format: "fdx" });
  return { ...base, export: exp, exportFdx: exp.fdx, exportLink: exp.link, exportPages: exp.pages, exportSpring: base.spring };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExport };
