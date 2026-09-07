// Beat craft — per-beat craft card assignment (screenwriting craft, D009)
import { selectCraftCards } from "./craft_cards.js";
import { getSequenceBeats } from "./story_structure_knowledge.js";

function trimmed(v){ return String(v||"").trim(); }

export function assignCraftPerBeat({ genre, tone, totalPages=90 } = {}) {
  const seqs = getSequenceBeats({ genre, tone, totalPages }).sequences;
  const cards = selectCraftCards({ genre, tone });
  const beats = [];
  seqs.forEach((s) => {
    // 5 beats per sequence for 40 total
    for (let i=0;i<5;i++) {
      const card = cards[(s.seq*5 + i) % cards.length];
      beats.push({
        seq: s.seq,
        beat: (s.seq-1)*5 + i + 1,
        title: `${s.title} beat ${i+1}`,
        craft: { id: card.id, title: card.title, technique: card.technique },
        page: s.pageStart + Math.round((i/5) * (s.pageEnd - s.pageStart)),
      });
    }
  });
  return beats.slice(0,40);
}

export default { assignCraftPerBeat };
