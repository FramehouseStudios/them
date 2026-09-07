// Sequence craft coverage — assign craft cards per sequence + coverage-style reader notes (D009 screenwriting)
import { selectCraftCards } from "./craft_cards.js";
import { getSequenceBeats } from "./story_structure_knowledge.js";

function trimmed(v){ return String(v||"").trim(); }

export function assignCraftPerSequence({ genre, tone, totalPages=90 } = {}) {
  const seq = getSequenceBeats({ genre, tone, totalPages });
  const cards = selectCraftCards({ genre, tone });
  return seq.sequences.map((s, idx) => {
    const card = cards[idx % cards.length];
    return {
      seq: s.seq,
      title: s.title,
      pages: s.pages,
      pageStart: s.pageStart,
      pageEnd: s.pageEnd,
      setpiece: s.setpiece,
      turn: s.turn,
      craft: { id: card.id, title: card.title, technique: card.technique, motif: card.motif },
    };
  });
}

export function buildCoverageNotes({ draft, project, genre, tone } = {}) {
  const text = trimmed(draft) || trimmed(project?.versions?.[0]?.draft) || "";
  const len = text.length;
  const lines = text.split("\n").length;
  const hasDialogue = /[A-Z]{2,}\n.+/.test(text);
  const hasHeading = /^(INT\.|EXT\.)/m.test(text);
  const notes = [];
  if (!hasHeading) notes.push("Add INT./EXT. heading — reader can't locate scene");
  if (!hasDialogue) notes.push("No character cue — add John/Sally/Sam dialogue to test voice");
  if (len < 800) notes.push("Thin draft — add want/obstacle/cost per scene 1-8");
  if (lines < 55) notes.push("Single page — expand to 8 sequences (~11p each) for 90p");
  // craft-aware
  const cards = selectCraftCards({ genre: genre||"horror", tone: tone||"dark" });
  if (cards[0]) notes.push(`Try craft ${cards[0].id} ${cards[0].title}: ${cards[0].technique.slice(0,80)}`);
  const overall = Math.max(1, Math.min(5, Math.round(2 + (hasHeading?1:0) + (hasDialogue?1:0) + (len>800?1:0))));
  const verdict = overall >=4 ? "RECOMMEND" : overall ===3 ? "CONSIDER" : "PASS";
  return { overall, verdict, notes, lines, len, hasHeading, hasDialogue };
}

export default { assignCraftPerSequence, buildCoverageNotes };
