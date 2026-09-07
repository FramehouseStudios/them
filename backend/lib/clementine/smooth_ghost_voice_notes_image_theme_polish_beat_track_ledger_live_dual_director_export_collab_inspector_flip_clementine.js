// Smooth ghost voice notes image theme polish beat track ledger live dual director export collab inspector flip clementine — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence + intuition + voice + spring (smooth amazing, D009) — note: samantha is clementine
import { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlip } from "./smooth_ghost_voice_notes_image_theme_polish_beat_track_ledger_live_dual_director_export_collab_inspector_flip.js";
import { shouldSuggest, buildSuggestion } from "./clementine_intuition.js";
import { getWriterVoiceProfile, updateWriterVoiceProfile, buildVulnerabilityAsk } from "./clementine_voice.js";

export function buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementine({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample } = {}) {
  const base = buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlip({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const suggest = shouldSuggest({ project: project || { characterContexts: [{name: character||"John", arcState:{pressure:5}}] }, draft: fountain });
  const suggestion = suggest ? buildSuggestion({ project: project || {}, parsed: { genre: genre||"horror", influences:{tones:[tone||"dark"]} }, draft: fountain }) : null;
  const voiceProfile = getWriterVoiceProfile(ownerKey || `owner-${character||"John"}`);
  if (sample) updateWriterVoiceProfile(ownerKey || `owner-${character||"John"}`, { sample });
  const vulnAsk = buildVulnerabilityAsk({ project: project || { versions:[{draft:fountain}], characterContexts:[{name: character||"John"}] }, parsed: { characters:[character||"John"] }, confidence: 0.55 });
  const clementinePresence = { state: "present", intuition: suggestion, voice: voiceProfile, vulnAsk, samanthaAlias: "clementine" };
  return { ...base, clementinePresence, clementineIntuition: suggestion, clementineVoice: voiceProfile, clementineVulnAsk: vulnAsk, samanthaIsClementine: true };
}

export default { buildSmoothGhostVoiceNotesImageThemePolishBeatTrackLedgerLiveDualDirectorExportCollabInspectorFlipClementine };
