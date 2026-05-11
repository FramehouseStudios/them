// T-genre-classifier — Craft Intelligence Suite, Layer 2.
//
// Deterministic genre + tone classifier. Operates on screenplay text
// (full or partial) and returns a small ranked list of genre
// candidates with confidence scores derived from keyword density,
// scene-heading patterns, character-cue density, and dialogue style.
//
// Pure: no LLM, no I/O. Same input → same output.
//
// Public surface:
//
//   classifyGenre({ text, frameworkId? }) -> {
//     schemaVersion, primaryGenre, primaryConfidence,
//     candidates: [{ genre, score, signals: [string] }],
//     tone: { intensity, comedyRatio, threatRatio },
//     summary
//   }
//
// Genre buckets (V1):
//   drama, thriller, horror, comedy, romance, action, sci-fi,
//   mystery, biography
//
// Each genre has a small lexicon (action verbs, settings, dialogue
// hints). Lexicons are intentionally short — the goal is "good
// enough to surface a strong signal", not Hollywood-grade
// classification. iOS can render the top candidate as a craft hint;
// the comp-matcher follow-up will use the full candidates array.

const SCHEMA_VERSION = 1;

const GENRE_LEXICONS = Object.freeze({
  thriller: {
    keywords: ["chase", "kill", "gun", "knife", "hunt", "stalk", "escape", "ambush", "trap", "blood", "sniper", "agent", "spy", "cartel", "assassin", "hostage"],
    settings: ["warehouse", "alley", "rooftop", "tunnel", "basement", "garage", "border"],
    weight: 1.0,
  },
  horror: {
    keywords: ["scream", "blood", "claw", "shadow", "demon", "ghost", "creature", "haunt", "corpse", "ritual", "possessed", "monster", "axe", "darkness"],
    settings: ["cabin", "basement", "graveyard", "cellar", "crypt", "forest", "attic"],
    weight: 1.0,
  },
  comedy: {
    keywords: ["laugh", "joke", "awkward", "absurd", "mortified", "deadpan", "punchline", "tease", "ridiculous", "embarrass", "smirk"],
    settings: ["office", "diner", "wedding", "party", "bar"],
    weight: 1.0,
  },
  romance: {
    keywords: ["kiss", "love", "heart", "tender", "ache", "whisper", "longing", "embrace", "yearning", "softly", "blush", "fingertips"],
    settings: ["bedroom", "garden", "balcony", "café", "park"],
    weight: 1.0,
  },
  action: {
    keywords: ["explode", "punch", "leap", "slam", "chase", "crash", "fire", "ammo", "gunshot", "speed", "throttle", "rooftop", "jump", "engine"],
    settings: ["highway", "rooftop", "helicopter", "battlefield", "warzone"],
    weight: 1.0,
  },
  "sci-fi": {
    keywords: ["spaceship", "alien", "android", "starship", "wormhole", "neural", "circuit", "synth", "quantum", "robot", "console", "airlock", "orbit", "drone"],
    settings: ["bridge", "lab", "starship", "station", "outpost", "colony"],
    weight: 1.0,
  },
  mystery: {
    keywords: ["clue", "suspect", "alibi", "evidence", "detective", "case", "murder", "missing", "victim", "interrogate", "witness", "motive", "investigation"],
    settings: ["station", "precinct", "morgue", "office", "warehouse"],
    weight: 1.0,
  },
  biography: {
    keywords: ["born", "remembers", "father", "mother", "childhood", "decade", "tradition", "heritage", "legacy", "wedding", "funeral", "diary", "letters"],
    settings: ["hometown", "kitchen", "porch", "chapel", "school"],
    weight: 0.9,
  },
  drama: {
    // Generic; lower per-keyword weight so it doesn't drown stronger genres.
    keywords: ["family", "fight", "regret", "lie", "secret", "decision", "betray", "promise", "choose", "leave", "stay"],
    settings: ["kitchen", "porch", "hallway", "living room", "office"],
    weight: 0.6,
  },
});

const TONE_KEYWORDS = Object.freeze({
  threatful: ["kill", "blood", "knife", "gun", "scream", "chase", "ambush", "shoot", "fire", "axe"],
  funny: ["laugh", "joke", "awkward", "smirk", "deadpan", "punchline", "ridiculous"],
});

function tokenize(text) {
  if (typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^a-z' \-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function countMatches(tokens, lexicon) {
  let count = 0;
  const hits = [];
  const kwSet = new Set(lexicon.keywords);
  const settingSet = new Set(lexicon.settings);
  for (const t of tokens) {
    if (kwSet.has(t)) { count += 1; hits.push(t); }
    else if (settingSet.has(t)) { count += 0.6; hits.push(t); }
  }
  return { count, hits };
}

function countSceneHeadings(text) {
  if (typeof text !== "string") return 0;
  const matches = text.match(/^(INT\.|EXT\.|INT\/EXT)/gim);
  return matches ? matches.length : 0;
}

function classifyGenre({ text = "", frameworkId = null } = {}) {
  const tokens = tokenize(text);
  const tokenCount = tokens.length || 1;
  const scenes = countSceneHeadings(text);

  const rawScores = {};
  const signals = {};
  for (const [genre, lex] of Object.entries(GENRE_LEXICONS)) {
    const { count, hits } = countMatches(tokens, lex);
    const density = (count / tokenCount) * 1000; // hits per 1000 words
    rawScores[genre] = density * lex.weight;
    signals[genre] = [...new Set(hits)].slice(0, 8);
  }

  // Tone signals derived from the same tokens.
  let threatHits = 0;
  let funnyHits = 0;
  const threatSet = new Set(TONE_KEYWORDS.threatful);
  const funnySet = new Set(TONE_KEYWORDS.funny);
  for (const t of tokens) {
    if (threatSet.has(t)) threatHits += 1;
    if (funnySet.has(t)) funnyHits += 1;
  }
  const threatRatio = Math.round((threatHits / tokenCount) * 10_000) / 10_000;
  const comedyRatio = Math.round((funnyHits / tokenCount) * 10_000) / 10_000;
  const intensity = threatRatio > 0.005 ? "high" : threatRatio > 0.002 ? "medium" : "low";

  // Normalize candidates so the top genre always shows >0 even on a
  // low-signal screenplay (drama default for short / generic text).
  const totalRaw = Object.values(rawScores).reduce((a, b) => a + b, 0);
  const candidates = Object.entries(rawScores)
    .map(([genre, score]) => ({
      genre,
      score: totalRaw > 0 ? Math.round((score / totalRaw) * 1000) / 1000 : 0,
      signals: signals[genre],
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = candidates[0] || { genre: "drama", score: 0, signals: [] };
  let primaryConfidence = top.score;
  // When two candidates are very close, drop confidence so the iOS
  // surface can show "uncertain" tone.
  if (candidates.length >= 2 && candidates[1].score >= top.score * 0.85) {
    primaryConfidence = Math.round(primaryConfidence * 0.7 * 1000) / 1000;
  }

  let summary;
  if (scenes === 0) {
    summary = `Genre signal is weak (no scene headings detected). Leaning ${top.genre}.`;
  } else if (primaryConfidence < 0.2) {
    summary = `Mixed genre signals. Leading: ${top.genre}.`;
  } else if (primaryConfidence < 0.5) {
    summary = `Reads as ${top.genre} with secondary ${candidates[1]?.genre || "drama"} tones.`;
  } else {
    summary = `Reads as ${top.genre}.`;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    primaryGenre: top.genre,
    primaryConfidence,
    candidates: candidates.slice(0, 5),
    tone: { intensity, comedyRatio, threatRatio },
    sceneHeadingCount: scenes,
    frameworkId: typeof frameworkId === "string" ? frameworkId : null,
    summary,
  };
}

export {
  classifyGenre,
  GENRE_LEXICONS,
  TONE_KEYWORDS,
  SCHEMA_VERSION as GENRE_CLASSIFIER_SCHEMA_VERSION,
};
