// Draft notes — per-draft studio notes (screenwriting craft, D009)
import { buildRewriteNotes } from "./rewrite_notes.js";
import { polishDraft } from "./polish_pass.js";

export function buildDraftNotes({ draft, sequences, craft } = {}) {
  const rewrite = buildRewriteNotes({ draft, sequences, craft });
  const polish = polishDraft({ draft, sequences });
  const notes = [...rewrite.notes];
  if (polish.changes.length) notes.push(`Polish: ${polish.changes.join(", ")}`);
  // writer-specific: if draft has ghost, remind to pay off
  if (String(draft).toLowerCase().includes("ghost")) notes.push("Ghost present — ensure final image echo pays scar");
  return { notes, count: notes.length, rewrite, polish };
}

export default { buildDraftNotes };
