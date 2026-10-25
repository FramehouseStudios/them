// Canonical server-owned notes policy. Clients send the writer's words, not an
// independently inferred output contract that can contradict this task.
const DIALOGUE_NOTES_CONTRACT = Object.freeze([
  "shape: one sentence naming what the line is doing (on the nose, a label, exposition, or a tactic that already works), then exactly one rewritten line in quotes that carries the same feeling through behavior or tactic, then stop.",
  "register: spoken prose in Clementine's voice; no Fountain block, no list, no headers; keep the writer's character names and the scene's facts.",
  "honesty: never praise a line that announces its feeling; if the line already works, say why in one sentence and offer no rewrite.",
  "scope: note the line the writer read, not the whole scene; one question at most, only if it unlocks the rewrite.",
]);
const DIALOGUE_NOTES_TRIM_CONTRACT = "mode_contract: name the line's tactic or weakness in one sentence; exactly one rewritten line in quotes, then stop; spoken prose, no Fountain/list; if it already works, explain why without rewrite; preserve facts.";

function asksForDialogueNotes(text) {
  const lower = String(text || "").toLowerCase();
  // Generating/revising pages and punch-up requests always outrank notes,
  // including a quoted line supplied as continuity inside such a request.
  if (/\b(write|draft|generate|compose|continue|finish|complete|rewrite|revise|polish|replace|punch[- ]up|punch up|sharpen|keep going|keep writing|carry on|give .* subtext|more subtext|less on[- ]the[- ]nose)\b/.test(lower)) return false;
  if (/\b(?:is|does) (?:this|the|that|my) (?:line|exchange|dialogue|speech|monologue) (?:too )?on[- ]the[- ]nose\b/.test(lower)) return false;
  const dialogue = /\b(dialogue|line|lines|exchange|speech|monologue|confession|apology)\b/.test(lower);
  return (dialogue && /\b(notes?|thoughts|feedback|opinion|take) on|\b(read|check|look at|hear) (this|the|my)|\b(here'?s|this is|try) (my|the|a|her|his)|\b(?:is|does) (this|the|that|my) (line|exchange|dialogue|speech|monologue) (work|working|land|landing)|\bon[- ]the[- ]nose\b/.test(lower)) || /\b(?:she|he|they|[a-z]+) says:/.test(lower);
}
export { asksForDialogueNotes, DIALOGUE_NOTES_CONTRACT, DIALOGUE_NOTES_TRIM_CONTRACT };
