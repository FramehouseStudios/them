// Subplot thread — B story via Sam listening vs John control (screenwriting craft, D009)
import { getSequenceBeats } from "./story_structure_knowledge.js";

function trimmed(v){ return String(v||"").trim(); }

export function buildSubplot({ characters = ["Sam"], motif, totalPages=90 } = {}) {
  const seqs = getSequenceBeats({ totalPages }).sequences;
  const who = Array.isArray(characters) ? characters[0] : trimmed(characters) || "Sam";
  const m = trimmed(motif) || "listening shadow";
  return seqs.map((s) => ({
    seq: s.seq,
    title: s.title,
    pageStart: s.pageStart,
    bStory: s.seq === 2 ? `${who} introduced listening` : s.seq === 4 ? `${who} midpoint listens too closely` : s.seq === 7 ? `${who} final choice` : `${who} echo`,
    motif: m,
    logline: `B${s.seq}: ${who} ${m} in ${s.title}`,
  }));
}

export default { buildSubplot };
