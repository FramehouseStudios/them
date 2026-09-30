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
