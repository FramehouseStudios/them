// Centralized prompt assembly (T08).
//
// The single function that produces every model-bound prompt the
// backend sends. Today there is one consumer — handleTalkRequest in
// backend/index.js. iOS-side ScreenplayPromptBuilder is Codex's
// follow-up; once it lands, all clients route generation through this
// function (or call a backend endpoint that does).
//
// The function is deliberately pure: given the same inputs, it
// produces the same string. Memory absent → no memory block (no
// "<empty>" markers, no null serialization). Memory present → a
// compact, model-friendly block immediately before user input.

const MEMORY_BLOCK_OPEN = "<creative_memory>";
const MEMORY_BLOCK_CLOSE = "</creative_memory>";

function isNonEmptyObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0;
}

function isNonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0;
}

function trimToString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function serializeStyle(style) {
  if (!isNonEmptyObject(style)) return "";
  const lines = [];
  if (style.preferredTone) lines.push(`tone: ${style.preferredTone}`);
  if (style.sentenceLengthBias) lines.push(`sentence-length: ${style.sentenceLengthBias}`);
  if (style.preferredFormatting) lines.push(`format: ${style.preferredFormatting}`);
  if (isNonEmptyArray(style.lexicalFingerprint)) {
    const trimmed = style.lexicalFingerprint.slice(-12).join("; ");
    lines.push(`recurring-phrases: ${trimmed}`);
  }
  return lines.length ? `style:\n  ${lines.join("\n  ")}` : "";
}

function serializeCharacters(characters) {
  if (!isNonEmptyArray(characters)) return "";
  // Most recently referenced first; cap to 8 to keep prompts compact.
  const sorted = [...characters].sort((a, b) => (b.last_referenced || 0) - (a.last_referenced || 0));
  const top = sorted.slice(0, 8);
  const lines = top.map((c) => {
    const tags = isNonEmptyArray(c.tags) ? ` [${c.tags.join(", ")}]` : "";
    const voice = trimToString(c.voice) ? ` — ${trimToString(c.voice)}` : "";
    return `  - ${c.name}${tags}${voice}`;
  });
  return `recurring-characters:\n${lines.join("\n")}`;
}

function serializeTone(tone) {
  if (!isNonEmptyObject(tone)) return "";
  const lines = [];
  if (tone.emotional_default) lines.push(`default: ${tone.emotional_default}`);
  if (tone.humor_register) lines.push(`humor: ${tone.humor_register}`);
  if (tone.violence_tolerance) lines.push(`violence: ${tone.violence_tolerance}`);
  return lines.length ? `tone:\n  ${lines.join("\n  ")}` : "";
}

function serializeHabits(habits) {
  if (!isNonEmptyObject(habits)) return "";
  const lines = [];
  if (habits.session_pattern) lines.push(`session-pattern: ${habits.session_pattern}`);
  if (Number.isFinite(habits.preferred_scene_length_pages)) {
    lines.push(`preferred-scene-length-pages: ${habits.preferred_scene_length_pages}`);
  }
  if (Number.isFinite(habits.page_completion_rate)) {
    lines.push(`page-completion-rate: ${habits.page_completion_rate}`);
  }
  return lines.length ? `habits:\n  ${lines.join("\n  ")}` : "";
}

function buildMemoryBlock(creativeMemory) {
  if (!creativeMemory) return "";
  const sections = [
    serializeStyle(creativeMemory.style),
    serializeCharacters(creativeMemory.characters),
    serializeTone(creativeMemory.tone),
    serializeHabits(creativeMemory.habits),
  ].filter(Boolean);
  if (sections.length === 0) return "";
  return `${MEMORY_BLOCK_OPEN}\n${sections.join("\n")}\n${MEMORY_BLOCK_CLOSE}`;
}

function buildSessionContextBlock(sessionContext) {
  if (!sessionContext || typeof sessionContext !== "object") return "";
  const parts = [];
  if (sessionContext.projectId) parts.push(`project: ${sessionContext.projectId}`);
  if (sessionContext.versionId) parts.push(`version: ${sessionContext.versionId}`);
  if (sessionContext.scene) parts.push(`scene: ${sessionContext.scene}`);
  return parts.length ? `<session>\n${parts.map((p) => `  ${p}`).join("\n")}\n</session>` : "";
}

// Single canonical entry point. Every model-bound prompt the backend
// constructs goes through this function.
function buildModelPrompt({
  persona = "",
  creativeMemory = null,
  userInput = "",
  sessionContext = null,
} = {}) {
  const parts = [];
  const personaText = trimToString(persona);
  if (personaText) parts.push(personaText);

  const memoryBlock = buildMemoryBlock(creativeMemory);
  if (memoryBlock) parts.push(memoryBlock);

  const sessionBlock = buildSessionContextBlock(sessionContext);
  if (sessionBlock) parts.push(sessionBlock);

  const inputText = trimToString(userInput);
  if (inputText) parts.push(inputText);

  return parts.join("\n\n");
}

// For tests and diagnostics — lets callers inspect what would have
// been emitted without producing the final string.
function buildModelPromptParts(args) {
  return {
    persona: trimToString(args?.persona),
    memoryBlock: buildMemoryBlock(args?.creativeMemory),
    sessionBlock: buildSessionContextBlock(args?.sessionContext),
    userInput: trimToString(args?.userInput),
  };
}

export {
  buildModelPrompt,
  buildModelPromptParts,
  MEMORY_BLOCK_OPEN,
  MEMORY_BLOCK_CLOSE,
};
