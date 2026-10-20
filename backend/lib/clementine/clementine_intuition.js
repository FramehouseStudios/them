// Clementine intuition — proactive suggestions before you ask.
// Uses coverage + craft + character pressure to emit x-suggestion.
// D009 strangler, no index.js growth.

import { selectCraftCards } from "./craft_cards.js";
import { getThreeActBeats } from "./story_structure_knowledge.js";

export function shouldSuggest({ project, draft } = {}) {
  const chars = project?.characterContexts || [];
  const pressure = chars.reduce((s,c)=> s + Number(c?.arcState?.pressure||0), 0);
  const len = String(draft||"").length;
  // Suggest when pressure high or draft thin and beats uncovered
  if (pressure >= 5) return true;
  if (len < 800) return true;
  return false;
}

export function buildSuggestion({ project, parsed, draft } = {}) {
  const genre = parsed?.genre || project?.tone || "horror";
  const tone = parsed?.influences?.tones?.[0] || "tense";
  let beats = [];
  try { beats = getThreeActBeats({ genre, tone, influences: parsed?.influences }).acts.flatMap(a=>a.beats).slice(0,2); } catch {}
  let card = null;
  try { card = selectCraftCards({ genre, tone })[0]; } catch {}
  const char = project?.characterContexts?.[0];
  const pressure = char?.arcState?.pressure ?? 0;
  const suggestions = [];
  if (pressure >= 4) suggestions.push(`${char?.name||"Lead"}’s want is thinning — want me to give ${char?.name||"them"} the "${card?.want||"want"}" line on next page?`);
  else suggestions.push(`Want me to thread "${card?.motif||"motif"}" into page ${Math.ceil(String(draft||"").split("\n").length/55)+1} with beats: ${beats.join(" / ")}?`);
  return {
    genre, tone, card: card?.title||"", beats,
    suggestions,
    xSuggestion: suggestions[0] || "",
  };
}

export default { shouldSuggest, buildSuggestion };
