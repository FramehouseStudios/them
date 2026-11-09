// M2a — LLM-backed slot extraction fallback for short-film intent.
// Safe: pure heuristic first, LLM JSON only when heuristic misses or open vocab needed.
// No backend/index.js growth; talk_generate will call resolveShortFilmIntent when chatSupplier available.

import { parseShortFilmIntent } from "./short_film_intent.js";

const DEFAULT_NAMES = ["Alex", "Maya", "Jonah", "Reyes", "Chen", "Sasha", "Kade", "Nori"];
const DEFAULT_LOCATIONS = ["airlock", "corridor", "observation deck", "lab", "fake set"];

function clampInt(n, lo, hi) {
  const v = Math.max(lo, Math.min(hi, Math.floor(Number(n) || lo)));
  return Number.isFinite(v) ? v : lo;
}

function extractCountFromText(text, fallback = 3) {
  const lower = String(text || "").toLowerCase();
  const m = lower.match(/(\d+|one|two|three|four|five|six|seven)\s*characters/);
  if (m) {
    const map = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
    const n = map[m[1]] != null ? map[m[1]] : Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 7) return n;
  }
  return fallback;
}

function autonomousNames(text, count) {
  const n = clampInt(count, 1, 7);
  return DEFAULT_NAMES.slice(0, n);
}

function autonomousLocations(text, count = 3) {
  const n = clampInt(count, 1, 5);
  // If text mentions space/fake set, bias to space locations
  const lower = String(text || "").toLowerCase();
  if (lower.includes("space") || lower.includes("astronaut") || lower.includes("fake set")) {
    return ["space station airlock", "space station corridor", "observation deck"].slice(0, n);
  }
  return DEFAULT_LOCATIONS.slice(0, n);
}

// Deterministic LLM stub prompt builder — real LLM call injected via chatSupplier.chat in talk_generate
function buildLLMExtractionPrompt(utterance) {
  return [
    `Extract short-film slots from this utterance as JSON:`,
    `Utterance: "${String(utterance).slice(0, 800)}"`,
    `Return JSON {genre:string, directors:string[], writers:string[], tones:string[], setting:string, characters:string[], totalPages:number, requestedPages:number}`,
    `Rules: genre open vocab (e.g., sci-fi, horror), directors includes Nolan/Kubrick/Wachowski variants, writers includes Kaufman/Sorkin, tones adjectives. If characters says "five characters I don't know names" return 5 placeholder names. If unknown, return [] or null, not hallucinated pages.`,
  ].join("\n");
}

async function llmExtractSlots(utterance, chatSupplier) {
  if (!chatSupplier || typeof chatSupplier.chat !== "function") return null;
  try {
    const prompt = buildLLMExtractionPrompt(utterance);
    const res = await chatSupplier.chat({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 300,
      temperature: 0,
    });
    const text = String(res?.text || res?.rawText || "").trim();
    const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    if (!jsonStr) return null;
    const j = JSON.parse(jsonStr);
    return j;
  } catch {
    return null;
  }
}

/**
 * Resolve short-film intent with heuristic + LLM fallback + autonomous fill.
 * Safe: never throws, returns null if still unresolvable.
 * @param {string} utterance
 * @param {{chatSupplier?:object, now?:number}} opts
 */
async function resolveShortFilmIntent(utterance, { chatSupplier = null, now = Date.now() } = {}) {
  const text = String(utterance || "");
  const lower = text.toLowerCase();
  // Fast path: heuristic (but guard against "don't know names" false positives like Don/Know)
  const heuristic = parseShortFilmIntent(text);
  if (heuristic) {
    const badNames = ["Don", "Know", "Their", "Names", "Dont"];
    const hasBad = heuristic.characters.some((c) => badNames.includes(c));
    const wantsAutonomous = lower.includes("don't know") || lower.includes("dont know") || lower.includes("unknown names") || lower.includes("no names");
    if (!(hasBad && wantsAutonomous)) return heuristic;
    // otherwise fall through to autonomous correction
  }

  // Check if utterance is short-film-ish but heuristic missed due to open vocab / missing names

  const isShortFilmish = lower.includes("short film") || (lower.includes("pages") && lower.includes("genre"));
  if (!isShortFilmish) return null;

  // Try LLM extraction
  let llm = null;
  if (chatSupplier) {
    llm = await llmExtractSlots(text, chatSupplier);
  }

  // Autonomous fallback when user says "don't know names" or missing characters
  let characters = null;
  if (llm?.characters && Array.isArray(llm.characters) && llm.characters.length) {
    characters = llm.characters.map((s) => String(s).trim()).filter(Boolean).slice(0, 7);
  } else if (lower.includes("don't know") || lower.includes("dont know") || lower.includes("unknown") || lower.includes("no names")) {
    const count = extractCountFromText(text, 5);
    characters = autonomousNames(text, count);
  } else if (lower.includes("five characters")) {
    characters = autonomousNames(text, 5);
  }

  let genre = llm?.genre ? String(llm.genre).toLowerCase() : null;
  if (!genre) {
    // Fallback: extract after "like" phrase for director-inspired genre (e.g., "sci-fi like Nolan")
    const gm = lower.match(/genre[^a-z]*([a-z-]+)/);
    if (gm) genre = gm[1].toLowerCase();
    else if (lower.includes("sci-fi") || lower.includes("scifi")) genre = "sci-fi";
    else if (lower.includes("horror")) genre = "horror";
  }

  let setting = llm?.setting ? String(llm.setting).toLowerCase() : null;
  if (!setting) {
    const sm = lower.match(/in\s+(?:a\s+)?(space|bedroom|kitchen|airlock|station|corridor|lab|fake set)/);
    if (sm) setting = sm[1].toLowerCase();
  }

  const directors = Array.isArray(llm?.directors) ? llm.directors : [];
  const writers = Array.isArray(llm?.writers) ? llm.writers : [];
  const tones = Array.isArray(llm?.tones) ? llm.tones : [];

  // Need at least genre and characters to be useful
  if (!genre || !characters || characters.length === 0) return null;

  const totalPages = Number(llm?.totalPages) || 15;
  const requestedPages = Number(llm?.requestedPages) || 5;

  return {
    totalPages: clampInt(totalPages, 1, 30),
    requestedPages: clampInt(requestedPages, 1, 30),
    genre,
    setting: setting || "space station",
    characters,
    influences: { directors, writers, tones },
  };
}

export { resolveShortFilmIntent, buildLLMExtractionPrompt, autonomousNames, autonomousLocations };
