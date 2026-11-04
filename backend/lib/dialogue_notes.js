// Canonical server-owned notes policy. Clients send the writer's words, not an
// independently inferred output contract that can contradict this task.
import { analyzeScreenplayWriteInstruction, maskQuotedScreenplayText } from "./screenplay_write_instruction.js";
const DIALOGUE_NOTES_CONTRACT = Object.freeze([
  "shape: one sentence naming what the line is doing (on the nose, a label, exposition, or a tactic that already works), then exactly one rewritten line in quotes that carries the same feeling through behavior or tactic, then stop.",
  "register: spoken prose in Clementine's voice; no Fountain block, no list, no headers; keep the writer's character names and the scene's facts.",
  "honesty: never praise a line that announces its feeling; if the line already works, say why in one sentence and offer no rewrite.",
  "scope: note the line the writer read, not the whole scene; one question at most, only if it unlocks the rewrite.",
]);
const DIALOGUE_NOTES_TRIM_CONTRACT = "mode_contract: name the line's tactic or weakness in one sentence; exactly one rewritten line in quotes, then stop; spoken prose, no Fountain/list; if it already works, explain why without rewrite; preserve facts.";

// Shared by task selection and the lane classifier. Revision directions after
// supplied dialogue must not be swallowed by the notes contract.
function isScreenplayRevisionRequest(text) {
  const instruction = analyzeScreenplayWriteInstruction(text);
  if (instruction.refusesPageWrite) return false;
  const lower = instruction.routingText.toLowerCase();
  return /\b(rewrite|revise|polish|replace|tighten|soften|shorten|swap out|another pass|do another pass|make it better|elevate|professionalize|pro pass|expert pass)\b/.test(lower)
    || /\b(make (?:this|it|this script|the script|this screenplay|the screenplay|this passage|this scene|the scene|this line|the line|this exchange|the exchange) (?:shorter|tighter|sharper|cleaner|faster|smarter|more expert|more professional|more cinematic|more emotional|more sophisticated|more filmic|less on[- ]the[- ]nose))\b/.test(lower);
}

function notesInstructionText(text) {
  // Dialogue is content, not an instruction. Keep directions after a balanced
  // quote so "Notes on this line: 'Stay.' Now rewrite it" is still a rewrite.
  const quotedLine = "\u0000";
  const masked = maskQuotedScreenplayText(text, quotedLine);
  const colon = masked.indexOf(":");
  if (colon < 0) return masked;
  const introduction = masked.slice(0, colon);
  const payload = masked.slice(colon + 1).trimStart();
  // Speech transcripts often supply the line without quotation marks. A
  // colon after an explicit read/notes cue or character attribution owns it.
  if (!payload.startsWith(quotedLine)
    && /\b(?:notes?|thoughts|feedback|opinion|take) on\b|\b(?:read|check|hear) (?:this|the|my)\b|\b[a-z]+ says$/.test(introduction)) {
    return introduction;
  }
  return masked;
}

function asksForDialogueNotes(text) {
  const lower = String(text || "").toLowerCase();
  const instruction = notesInstructionText(lower);
  // Generating/revising pages and punch-up requests always outrank notes,
  // including a quoted line supplied as continuity inside such a request.
  if (isScreenplayRevisionRequest(instruction)
    || /\b(write|draft|generate|compose|continue|finish|complete|punch[- ]up|punch up|sharpen|keep going|keep writing|carry on|give .* subtext|more subtext|less on[- ]the[- ]nose)\b/.test(instruction)) return false;
  if (/\b(?:is|does) (?:this|the|that|my) (?:line|exchange|dialogue|speech|monologue) (?:too )?on[- ]the[- ]nose\b/.test(instruction)) return false;
  const dialogue = /\b(dialogue|line|lines|exchange|speech|monologue|confession|apology)\b/.test(lower);
  return (dialogue && /\b(notes?|thoughts|feedback|opinion|take) on|\b(read|check|look at|hear) (this|the|my)|\b(here'?s|this is|try) (my|the|a|her|his)|\b(?:is|does) (this|the|that|my) (line|exchange|dialogue|speech|monologue) (work|working|land|landing)|\bon[- ]the[- ]nose\b/.test(lower)) || /\b(?:she|he|they|[a-z]+) says:/.test(lower);
}
export { asksForDialogueNotes, isScreenplayRevisionRequest, DIALOGUE_NOTES_CONTRACT, DIALOGUE_NOTES_TRIM_CONTRACT };
