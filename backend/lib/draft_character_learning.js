// Learns character voices from the writer's own saved pages.
//
// Character memory (the Studio rail's "Voice inventory", and the traits block
// in the companion prompt) used to learn only from conversation turns. Pages a
// writer typed never taught it who NORA is or how she talks, even though the
// rail's empty state promised that dialogue would. After a successful version
// save, the dialogue on the page runs through the same deterministic trait
// extractor the talk path uses and is merged into that project's characters.
//
// Contract:
//   - best effort: runs after the save response, never blocks or fails it;
//   - no provider calls (extractTraits is pure);
//   - bounded: at most 8 speakers and 40 dialogue lines each per save;
//   - quiet on autosave churn: skipped when the page's dialogue is unchanged
//     since the last learn for that user + project;
//   - scoped: only for an authenticated memory user, tagged with the project.

import { createHash } from "node:crypto";

import { defaultResolveMemoryUserId } from "./memory_route_auth.js";
import { extractTraits as defaultExtractTraits } from "./trait_library.js";

const MAX_CHARACTERS = 8;
const MAX_LINES_PER_CHARACTER = 40;
const MAX_REMEMBERED_FINGERPRINTS = 500;
const CUE_EXTENSION = /\s*\((?:V\.?\s?O\.?|O\.?\s?S\.?|O\.?\s?C\.?|CONT'?D|CONTINUED)\)\s*$/i;

function isCharacterCue(line) {
  if (!line || line.length > 40) return false;
  if (line.startsWith("@")) return line.length > 1;
  if (line !== line.toUpperCase() || !/[A-Z]/.test(line)) return false;
  if (/^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s]/.test(line)) return false;
  if (/TO:$/.test(line) || /^FADE (IN|OUT)/.test(line) || line === "THE END") return false;
  if (/[.!?:]$/.test(line) && !/\)$/.test(line)) return false;
  return true;
}

function cueName(line) {
  return line.replace(/^@/, "").replace(/\s*\^$/, "").replace(CUE_EXTENSION, "").trim();
}

/**
 * A cue is the name in screenplay caps ("MARA", "DR. CHEN"); memory keeps the
 * name ("Mara", "Dr. Chen"). Stored as "MARA", a page-learned character hid
 * the writer's own "Mara" from lookups and showed in caps on memory cards.
 */
function characterNameFromCue(cue) {
  return String(cue || "").toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
}

function extractDraftCharacterDialogue(draft, {
  maxCharacters = MAX_CHARACTERS,
  maxLinesPerCharacter = MAX_LINES_PER_CHARACTER,
} = {}) {
  const lines = String(draft || "").replace(/\r\n?/g, "\n").split("\n");
  const byName = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const cue = lines[index].trim();
    const afterBlank = index === 0 || lines[index - 1].trim() === "";
    if (!afterBlank || !isCharacterCue(cue)) continue;
    const name = cueName(cue);
    if (!name) continue;
    const spoken = [];
    let next = index + 1;
    for (; next < lines.length; next += 1) {
      const line = lines[next].trim();
      if (!line) break;
      if (line.startsWith("(")) continue;
      spoken.push(line);
    }
    index = next - 1;
    if (!spoken.length) continue;
    const key = name.toUpperCase();
    if (!byName.has(key) && byName.size >= maxCharacters) continue;
    const entry = byName.get(key) || { name, lines: [] };
    for (const line of spoken) {
      if (entry.lines.length >= maxLinesPerCharacter) break;
      entry.lines.push(line);
    }
    byName.set(key, entry);
  }
  return [...byName.values()];
}

function traitsHaveSignal(traits) {
  if (!traits || typeof traits !== "object") return false;
  const lists = [traits.vocabulary, traits.keywords, traits.goals, traits.voice_fingerprint?.tactics];
  if (lists.some((list) => Array.isArray(list) && list.length)) return true;
  if (traits.relationships && Object.keys(traits.relationships).length) return true;
  return Boolean(traits.emotional_default || traits.speech_style?.pace || traits.speech_style?.syntax);
}

function createDraftCharacterLearner({
  recordCharacterMention,
  extractTraits = defaultExtractTraits,
  resolveUserId = defaultResolveMemoryUserId,
  logger = console,
  maxRememberedFingerprints = MAX_REMEMBERED_FINGERPRINTS,
} = {}) {
  if (typeof recordCharacterMention !== "function" || typeof extractTraits !== "function") {
    throw new Error("createDraftCharacterLearner requires recordCharacterMention and extractTraits");
  }
  const lastFingerprintByScope = new Map();

  async function learnFromDraft({ userId, projectId, projectTitle = "", draft }) {
    const cleanUserId = String(userId || "").trim();
    const cleanProjectId = String(projectId || "").trim();
    if (!cleanUserId || !cleanProjectId) return { learned: 0, skipped: "missing_scope" };
    const speakers = extractDraftCharacterDialogue(draft);
    if (!speakers.length) return { learned: 0, skipped: "no_dialogue" };

    const scope = `${cleanUserId}\u0000${cleanProjectId}`;
    const fingerprint = createHash("sha1").update(JSON.stringify(speakers)).digest("hex");
    if (lastFingerprintByScope.get(scope) === fingerprint) return { learned: 0, skipped: "unchanged" };
    lastFingerprintByScope.delete(scope);
    lastFingerprintByScope.set(scope, fingerprint);
    if (lastFingerprintByScope.size > maxRememberedFingerprints) {
      lastFingerprintByScope.delete(lastFingerprintByScope.keys().next().value);
    }

    const cleanTitle = String(projectTitle || "").trim().slice(0, 160);
    let learned = 0;
    for (const { name, lines } of speakers) {
      const traits = extractTraits({ characterName: name, lines });
      if (!traitsHaveSignal(traits)) continue;
      await recordCharacterMention({
        userId: cleanUserId,
        characterName: characterNameFromCue(name),
        source: "draft_save",
        tags: ["screenplay"],
        metadata: { projectId: cleanProjectId, ...(cleanTitle ? { projectTitle: cleanTitle } : {}) },
        traits,
      });
      learned += 1;
    }
    return { learned };
  }

  /** Fire-and-forget hook for the version-save route (`onScreenplayVersionSaved`). */
  function onVersionSaved({ req, project, draft } = {}) {
    const input = {
      userId: resolveUserId(req),
      projectId: project?.id,
      projectTitle: project?.title,
      draft,
    };
    setImmediate(() => {
      learnFromDraft(input).catch((error) => {
        logger?.warn?.(`[draft_character_learning] skipped error=${String(error?.message || error)}`);
      });
    });
  }

  return { learnFromDraft, onVersionSaved };
}

export {
  characterNameFromCue,
  createDraftCharacterLearner,
  extractDraftCharacterDialogue,
  isCharacterCue,
  traitsHaveSignal,
};
