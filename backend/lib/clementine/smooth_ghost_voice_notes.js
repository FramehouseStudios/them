// Smooth ghost voice notes — per-scene ghost + voice + notes + spring (smooth amazing, D009)
import { buildSmoothGhostVoice } from "./smooth_ghost_voice.js";
import { buildDraftNotes } from "./draft_notes.js";

export function buildSmoothGhostVoiceNotes({ scene, character, ghost, want, need, motif, scar, finalImage, lexicon, draft } = {}) {
  const base = buildSmoothGhostVoice({ scene, character, ghost, want, need, motif, scar, finalImage, lexicon });
  const notes = buildDraftNotes({ draft: draft || base.payoff, sequences: [{ seq: scene, title: `S${scene}` }], craft: { id: "cc-21", title: "Time Loop Scar", technique: "Rule of 3 loops" } });
  return { ...base, notes: notes.notes, notesCount: notes.count };
}

export default { buildSmoothGhostVoiceNotes };
