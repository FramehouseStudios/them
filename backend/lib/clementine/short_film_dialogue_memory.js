import { getCharacterContext, pushCharacterMemory } from "./short_film_character_context.js";

const MAX_DIALOGUE_CHARS = 400;
const MAX_LINES_PER_CHARACTER = 3;
const MAX_LINES_PER_DRAFT = 12;

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function canonicalCue(line, knownCharacters) {
  const cue = clean(line);
  if (!cue || cue.length > 64 || cue !== cue.toUpperCase()) return "";
  if (/^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.|FADE\s|CUT\s|TITLE:|THE END\b)/.test(cue)) return "";
  const withoutExtension = cue.replace(/\s+\((?:V\.O\.|O\.S\.|O\.C\.|CONT['’]?D)\)$/, "").trim();
  return knownCharacters.get(withoutExtension) || "";
}

function isHeaderLike(line) {
  const value = clean(line);
  if (!value || value.startsWith("(")) return true;
  if (/^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.|FADE\s|CUT\s|TITLE:|THE END\b)/i.test(value)) return true;
  if (/^[A-Z0-9 .,'’\-]+ TO:$/.test(value)) return true;
  if (/^[A-Z0-9][A-Z0-9 .,'’/&\-]*:?$/.test(value) && value.split(/\s+/).length <= 10) return true;
  return false;
}

/** Extract only the physical line immediately following a known Fountain cue. */
function extractCharacterDialogueMemories({ draft = "", characters = [] } = {}) {
  const knownCharacters = new Map(
    characters
      .map((name) => clean(name))
      .filter(Boolean)
      .map((name) => [name.toUpperCase(), name])
  );
  if (!knownCharacters.size) return [];

  const lines = String(draft).replace(/\r\n?/g, "\n").split("\n");
  const perCharacter = new Map();
  const memories = [];
  let page = 1;

  for (let index = 0; index < lines.length && memories.length < MAX_LINES_PER_DRAFT; index += 1) {
    const pageMatch = clean(lines[index]).match(/\bPAGE\s+(\d{1,3})\b/i);
    if (pageMatch) page = Math.max(1, Number(pageMatch[1]) || page);
    const character = canonicalCue(lines[index], knownCharacters);
    if (!character) continue;
    const dialogue = clean(lines[index + 1]);
    if (isHeaderLike(dialogue) || canonicalCue(dialogue, knownCharacters)) continue;
    const count = perCharacter.get(character) || 0;
    if (count >= MAX_LINES_PER_CHARACTER) continue;
    memories.push({ name: character, text: dialogue.slice(0, MAX_DIALOGUE_CHARS), page, role: "dialogue" });
    perCharacter.set(character, count + 1);
  }
  return memories;
}

function applyCharacterDialogueMemories(project, memories = []) {
  let applied = 0;
  for (const memory of memories) {
    const context = getCharacterContext(project, memory?.name);
    const text = clean(memory?.text);
    const page = Math.max(1, Number(memory?.page) || 1);
    const role = clean(memory?.role) || "dialogue";
    const duplicate = context?.memory?.some((entry) =>
      clean(entry?.text) === text
      && Math.max(1, Number(entry?.page) || 1) === page
      && (clean(entry?.role) || "dialogue") === role
    );
    if (duplicate) continue;
    if (pushCharacterMemory(project, memory)) applied += 1;
  }
  return applied;
}

async function prepareShortFilmPromptProject({ req, parsed, now = Date.now() } = {}) {
  if (!req) return null;
  req.clementine ||= {};
  const ownerRecord = req.clementine.screenplayOwnerRecord || req.screenplayOwnerRecord || null;
  if (!ownerRecord) return null;
  try {
    const { ensureShortFilmProjectWithContexts } = await import("./short_film_store.js");
    const { project } = ensureShortFilmProjectWithContexts({ ownerRecord, parsed, now });
    req.clementine.screenplayProjectForPrompt = project;
    return project;
  } catch {
    return null;
  }
}

export {
  extractCharacterDialogueMemories,
  applyCharacterDialogueMemories,
  prepareShortFilmPromptProject,
  MAX_DIALOGUE_CHARS,
  MAX_LINES_PER_CHARACTER,
  MAX_LINES_PER_DRAFT,
};
