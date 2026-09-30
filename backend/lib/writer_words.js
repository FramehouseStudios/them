// The writer's own words in a turn. A typed "Write the next page" reaches the
// backend inside the app's elevated feature brief, whose planner text ("…force
// different tactics instead of repeating the premise", "do not summarize")
// was read as the writer's correction and stored as story memory (seen live
// 2026-09-30: "Correction to honor: Continue the feature as feature-film
// screenplay pages…"). Only the direction line, or the text after "Writer
// request:", is the writer speaking; any other turn is theirs whole.
export function writerWordsFromTurn(transcript = "") {
  const source = String(transcript || "");
  const direction = source.match(/Writer's immediate direction:\s*([^\n]+)/i)?.[1];
  if (direction) return direction.trim();
  const parts = source.split(/Writer request:/i);
  if (parts.length > 1) return parts.pop().trim();
  return source;
}

export function isElevatedBrief(transcript = "") {
  return /Writer's immediate direction:|Writer request:/i.test(String(transcript || ""));
}
