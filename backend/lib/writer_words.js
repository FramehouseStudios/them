// The writer's own words in a turn. A typed "Write the next page" reaches the
// backend inside the app's elevated feature brief, whose planner text ("…force
// different tactics instead of repeating the premise", "do not summarize")
// was read as the writer's correction and stored as story memory (seen live
// 2026-09-30: "Correction to honor: Continue the feature as feature-film
// screenplay pages…"). Only the direction line, or the text after "Writer
// request:", is the writer speaking; any other turn is theirs whole.
export function writerWordsFromTurn(transcript = "") {
  const source = String(transcript || "");
  // The brief can arrive flattened onto one line; the direction ends where the
  // app's next bullet starts ("- Current feature position:", written right
  // after it by ScreenplayFeatureWorkflowPlanner), or "Write the next page. -
  // Current feature position: Act II ..." was stored as the writer's
  // correction (2026-09-30).
  const direction = source.match(/Writer's immediate direction:\s*(.+?)(?=\s+-\s+Current feature position:|\n|$)/i)?.[1];
  if (direction) return direction.trim();
  const parts = source.split(/Writer request:/i);
  if (parts.length > 1) return parts.pop().trim();
  return source;
}

export function isElevatedBrief(transcript = "") {
  return /Writer's immediate direction:|Writer request:/i.test(String(transcript || ""));
}

// What History shows as the writer's side of a turn. The app's own briefs
// were listed as "You shared “Write the first page of a screenplay scene for
// Aaron. Scene impulse: …”" and "Continue the feature as feature-film
// screenplay pages…" - words the writer never typed (2026-09-30). The first
// page shows the scene the writer gave; a continuation brief shows the
// writer's direction, or "Continue the script" when the stored turn was cut
// before it.
export function writerWordsForHistory(transcript = "") {
  const source = String(transcript || "").trim();
  const impulse = source.match(/^Write the first page of a screenplay scene for [^.]*\.\s*Scene impulse:\s*(.+?)(?=\s+Write only the page content|\n|$)/i)?.[1];
  if (impulse) return `First page: ${impulse.trim()}`;
  if (isElevatedBrief(source)) return writerWordsFromTurn(source);
  if (/^Continue the feature as feature-film screenplay pages\b/i.test(source)) return "Continue the script";
  return source;
}

// A recap saved before History used the writer's words still quoted the brief
// ("You shared “Write the first page of a screenplay scene for…”"). Its quote
// is rewritten the same way when memory is read.
export function recapWithWriterWords(recap = "") {
  return String(recap || "").replace(/You shared “([^”]*)”/, (whole, quoted) => {
    const words = writerWordsForHistory(quoted.replace(/…$/, ""));
    return words === quoted.replace(/…$/, "") ? whole : `You shared “${words.replace(/[.!?]+$/, "")}”`;
  });
}
