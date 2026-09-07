// Scene craft suggestion — per-scene craft tailored to writer patterns (partner learning, D009)
import { suggestCraftForWriter } from "./craft_suggestion.js";
import { getSequenceBeats } from "./story_structure_knowledge.js";

export function suggestCraftPerScene({ ownerKey, genre, tone, totalPages=90 } = {}) {
  const seqs = getSequenceBeats({ genre, tone, totalPages }).sequences;
  return seqs.map(s=> {
    const { craft, reason } = suggestCraftForWriter({ ownerKey, genre, tone });
    return { seq: s.seq, title: s.title, craft, reason, pageStart: s.pageStart };
  });
}

export default { suggestCraftPerScene };
