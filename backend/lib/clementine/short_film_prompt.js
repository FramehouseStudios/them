// Short-film prompt builder + deterministic offline draft (PR2).
// Builds system+user prompt for any genre/tone/mood 3-act, with per-character memory.
// Uses story_structure_knowledge when available, falls back to generic scaffold.

import { getThreeActBeats } from "./story_structure_knowledge.js";

const promptCache = new Map();
const PROMPT_CACHE_MAX = 64;

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Build short-film prompt for Page lane.
 * @param {{totalPages:number,requestedPages:number,genre:string,setting:string,characters:string[]}} parsed
 * @returns {{system:string,user:string,outline:string}}
 */
function buildShortFilmPrompt(parsed, opts = {}) {
  const project = opts.project || null;
  const key = JSON.stringify([parsed?.totalPages, parsed?.requestedPages, parsed?.genre, parsed?.setting, parsed?.characters, parsed?.influences, project?.characterContexts?.map((c)=>`${c.name}:${c.voice}:${c.memory?.length||0}`).join("|")||""]);
  if (promptCache.has(key)) return promptCache.get(key);
  const total = Number(parsed?.totalPages) || 15;
  const req = Number(parsed?.requestedPages) || 5;
  const genre = trimToString(parsed?.genre) || "horror";
  const setting = trimToString(parsed?.setting) || "bedroom";
  const chars = Array.isArray(parsed?.characters) ? parsed.characters : [];
  const charLine = chars.length ? `Characters: ${chars.join(", ")}.` : "";
  const charNames = chars.join(", ");
  const influences = parsed?.influences || { directors: [], writers: [], tones: [] };
  const influenceLine = [
    influences.directors?.length ? `Directors: ${influences.directors.join(", ")}.` : "",
    influences.writers?.length ? `Writers: ${influences.writers.join(", ")}.` : "",
    influences.tones?.length ? `Tones: ${influences.tones.join(", ")}.` : "",
  ].filter(Boolean).join(" ");

  // Omniscient 3-act beats via knowledge (tone/mood + influences)
  let structure = null;
  try {
    structure = getThreeActBeats({ genre, tone: influences.tones?.[0] || "", mood: parsed?.mood || "", influences });
  } catch {}
  const outline = structure
    ? [
        `${total}-page outline — 3-act beats (${structure.genre}${structure.rawGenre!==structure.genre?` ← ${parsed.genre}`:""}):`,
        `Act 1 Setup — ${structure.acts[0].beats.join(" / ")} — introduce ${charNames} in ${setting}`,
        `Act 2 Confrontation — ${structure.acts[1].beats.join(" / ")}`,
        `Act 3 Resolution — ${structure.acts[2].beats.join(" / ")} — motif: ${structure.motif}`,
        structure.voiceHints ? `Voice: ${structure.voiceHints}` : "",
        structure.imageEcho ? `Image: ${structure.imageEcho}` : "",
        structure.directorHint || "",
        `This request delivers the first ${req} pages.`,
      ].filter(Boolean).join("\n")
    : [
        `${total}-page outline scaffold (3 acts):`,
        `Act 1 SETUP — ${genre} in ${setting}, introduce ${charNames}, inciting pressure.`,
        `Act 2 CONFRONTATION — tension escalates, want/obstacle/cost sharpens.`,
        `Act 3 RESOLUTION — payoff, image echo, cost paid.`,
        `This request delivers the first ${req} pages.`,
      ].join("\n");

  // Per-character voices/memory snapshot (singular project, individual context)
  let characterBlock = "";
  if (project && Array.isArray(project.characterContexts) && project.characterContexts.length) {
    const lines = project.characterContexts.map((c) => {
      const mem = Array.isArray(c.memory) ? c.memory.slice(-2).map((m)=>`"${m.text}"`).join(" | ") : "";
      return `${c.name} — voice ${c.voice}, backstory: ${c.backstory}${mem?` | recent: ${mem}`:""}`;
    });
    characterBlock = `Per-character context (same project, isolated memory):\n${lines.join("\n")}`;
  }

  const system = [
    `You are Clementine writing Fountain screenplay pages.`,
    `Owner bar: distinct character voice, subtext, want/obstacle/cost, motif image echo, anti-cliché, playable format.`,
    `Constraints: Genre=${genre}. Single location INT. ${setting.toUpperCase()}. Must use ${chars.length} characters: ${charNames}.`,
    influenceLine,
    characterBlock,
    `Total length ${total} pages (delivering ${req} pages now). This turn writes exactly ${req} pages.`,
    `Output only Fountain screenplay text — plain Fountain, no PAGE markers, no preamble, no logline.`,
    outline,
    charLine,
  ].filter(Boolean).join("\n\n");

  const user = [
    `Write the first ${req} pages of a ${total}-page ${genre} short film.`,
    `One location: ${setting} (INT. ${setting.toUpperCase()}).`,
    charLine,
    influenceLine ? `Influences: ${influenceLine}` : "",
    `Deliver exactly ${req} pages of plain Fountain.`,
  ].filter(Boolean).join(" ");

  const result = { system, user, outline };
  if (promptCache.size >= PROMPT_CACHE_MAX) {
    const firstKey = promptCache.keys().next().value;
    promptCache.delete(firstKey);
  }
  promptCache.set(key, result);
  return result;
}

/**
 * Deterministic offline draft for tests — plain Fountain, no "--- PAGE n ---" markers.
 * Injected from tests only; production never falls back to this.
 */
function generateOfflineShortFilmDraft(parsed) {
  const setting = (trimToString(parsed?.setting) || "bedroom").toUpperCase();
  const chars = Array.isArray(parsed?.characters) && parsed.characters.length ? parsed.characters : ["John", "Sally", "Sam"];
  const [c1, c2, c3] = chars;
  const req = Number(parsed?.requestedPages) || 5;
  const pages = [];
  for (let i = 1; i <= req; i++) {
    pages.push([
      `INT. ${setting}`,
      ``,
      `The room holds its breath. A whisper clings to the dark.`,
      ``,
      `${c1.toUpperCase()}`,
      `We shouldn't have stayed.`,
      ``,
      `${c2.toUpperCase()}`,
      `The bedroom remembers what we tried to forget.`,
      ``,
      `${c3.toUpperCase()}`,
      `Listen — the shadow by the door is listening too.`,
      ``,
      `They move around the ${setting.toLowerCase()}, fear tightening as blood thins the night.`,
      ``,
    ].join("\n"));
  }
  // Plain Fountain, pages separated by blank lines (no markers)
  return pages.join("\n\n");
}

export {
  buildShortFilmPrompt,
  generateOfflineShortFilmDraft,
};
