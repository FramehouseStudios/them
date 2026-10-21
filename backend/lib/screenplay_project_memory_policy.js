const SCREENPLAY_PROJECT_MEMORY_PROMPT_INTENTS = new Set([
  "write_scene", "rewrite_scene", "continue_script", "scene_doctor",
  "outline_structure", "character_development", "dialogue_punchup", "dialogue_notes",
  "emotional_continuity", "pacing_pass", "finish_feature", "momentum_rescue",
]);
function screenplayTaskCanUseProjectMemory(task, hint = "") {
  const intent = String(task?.intent || "").trim();
  if (!SCREENPLAY_PROJECT_MEMORY_PROMPT_INTENTS.has(intent) || !String(hint || "").trim()) return false;
  if (["continue_script", "finish_feature", "write_scene", "rewrite_scene", "scene_doctor", "dialogue_punchup", "dialogue_notes", "momentum_rescue"].includes(intent)) return true;
  return /\b(screenplay|script|scene|pages?|act|feature|movie|film|draft|dialogue|beat|sequence|fountain|character|ending|outline|story|emotional continuity|pacing|stuck|blocked|writer'?s block|writers block|creative block|out of ideas|next move)\b/.test(String(hint).toLowerCase());
}
export { SCREENPLAY_PROJECT_MEMORY_PROMPT_INTENTS, screenplayTaskCanUseProjectMemory };
