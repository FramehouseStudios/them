// Beat sheet export — 8seq + 40 beats + craft per seq (screenwriting craft, D009)
import { getSequenceBeats } from "./story_structure_knowledge.js";
import { assignCraftPerSequence } from "./sequence_craft_coverage.js";

export function buildBeatSheet({ genre, tone, totalPages=90 } = {}) {
  const seqCraft = assignCraftPerSequence({ genre, tone, totalPages });
  const seqBeats = getSequenceBeats({ genre, tone, totalPages });
  return seqCraft.map((s, idx) => ({
    seq: s.seq,
    title: s.title,
    pages: s.pages,
    pageStart: s.pageStart,
    pageEnd: s.pageEnd,
    setpiece: s.setpiece,
    turn: s.turn,
    craft: s.craft,
    beat: seqBeats.sequences[idx]?.title || s.title,
  }));
}

export function exportBeatSheetFDX({ beatSheet } = {}) {
  const rows = (Array.isArray(beatSheet) ? beatSheet : []).map(s=> `Seq ${s.seq}: ${s.title} p${s.pageStart}-${s.pageEnd} ${s.craft.title}`).join("\n");
  return `<FinalDraft><BeatSheet>\n${rows}\n</BeatSheet></FinalDraft>`;
}

export default { buildBeatSheet, exportBeatSheetFDX };
