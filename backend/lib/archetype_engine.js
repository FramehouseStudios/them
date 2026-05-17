// T-archetype-engine — Craft Intelligence Suite, Layer 2.
//
// Pure deterministic archetype detector. Maps a character's stored
// traits + scene presence onto canonical narrative archetypes (hero,
// mentor, shadow, trickster, ally, herald, threshold-guardian,
// shapeshifter). Surfaces a confidence-ranked list per character so
// the writing companion can suggest character-arc moves that match
// the archetype the character is drifting toward.
//
// Public surface (pure; same input → same output):
//
//   classifyArchetypes({ characters }) -> {
//     schemaVersion,
//     entries: [
//       {
//         name,
//         primary: { archetype, score, signals },
//         candidates: [{ archetype, score, signals }],
//         summary
//       }
//     ]
//   }
//
//   classifyCharacterArchetype(character) -> { primary, candidates, summary }
//
// Inputs are the character records produced by `creative_memory_store`
// (after T-trait-library extended `recordCharacterMention` with
// `traits`). Each character is expected to look like:
//
//   {
//     name: "JUNE",
//     last_referenced: <ms>,
//     tags: ["lead", "ios_rendered_page", ...],
//     voice: "...",
//     traits: {
//       keywords: ["anxious", "tender", ...],
//       speech_style: { pace, syntax },
//       emotional_default: "anxious",
//       goals: [...],
//       relationships: { OTHER_NAME: "label", ... }
//     }
//   }
//
// Cold characters (no traits) still get a classification — drawn from
// scene-presence heuristics + tags — just with lower confidence.

const SCHEMA_VERSION = 1;

// Archetype lexicon — each entry lists the trait keywords + tags +
// relationship-label fragments that lean toward it. Weights tune how
// strongly each signal counts. Tuned so that confident traits push
// confidence high; cold characters cluster around the default
// "ally" with low confidence.
const ARCHETYPES = Object.freeze({
  hero: {
    traitKeywords: ["ambitious", "fierce", "earnest", "righteous", "vulnerable", "haunted"],
    emotionalDefaults: ["earnest", "haunted", "driven"],
    tags: ["lead", "protagonist", "hero"],
    relationshipFragments: ["self", "lover", "rival"],
    minSceneShare: 0.20,
    weight: 1.0,
  },
  mentor: {
    traitKeywords: ["calm", "patient", "weary", "stoic", "warm", "wise"],
    emotionalDefaults: ["stoic", "weary", "warm"],
    tags: ["mentor", "teacher", "guide"],
    relationshipFragments: ["mentor", "teacher", "father", "mother", "elder"],
    minSceneShare: 0.05,
    weight: 1.0,
  },
  shadow: {
    traitKeywords: ["ruthless", "cynical", "cold", "guarded", "stern"],
    emotionalDefaults: ["cold", "cynical"],
    tags: ["villain", "antagonist", "shadow"],
    relationshipFragments: ["enemy", "rival", "villain"],
    minSceneShare: 0.10,
    weight: 1.0,
  },
  trickster: {
    traitKeywords: ["wry", "playful", "impulsive", "skeptical"],
    emotionalDefaults: ["wry", "playful"],
    tags: ["trickster", "comic", "rogue"],
    relationshipFragments: ["rival", "friend"],
    minSceneShare: 0.05,
    weight: 0.9,
  },
  ally: {
    traitKeywords: ["loyal", "tender", "earnest", "warm"],
    emotionalDefaults: ["loyal", "tender", "warm"],
    tags: ["ally", "friend", "sidekick", "supporting"],
    relationshipFragments: ["friend", "sibling", "ally"],
    minSceneShare: 0.05,
    weight: 0.85,
  },
  herald: {
    traitKeywords: ["earnest", "ambitious"],
    emotionalDefaults: ["earnest"],
    tags: ["messenger", "herald", "informant"],
    relationshipFragments: ["informant", "courier"],
    minSceneShare: 0.0,
    weight: 0.8,
  },
  threshold_guardian: {
    traitKeywords: ["guarded", "stern", "stoic"],
    emotionalDefaults: ["stoic", "guarded"],
    tags: ["gatekeeper", "guardian"],
    relationshipFragments: ["gatekeeper", "boss"],
    minSceneShare: 0.0,
    weight: 0.8,
  },
  shapeshifter: {
    traitKeywords: ["wry", "skeptical", "guarded"],
    emotionalDefaults: ["wry"],
    tags: ["shapeshifter", "double-agent"],
    relationshipFragments: ["double-agent", "ex", "lover"],
    minSceneShare: 0.05,
    weight: 0.8,
  },
});

function intersectionCount(arr, set) {
  if (!Array.isArray(arr)) return 0;
  let n = 0;
  for (const v of arr) {
    if (typeof v === "string" && set.has(v.toLowerCase())) n += 1;
  }
  return n;
}

function relationshipLabelHits(character, fragments) {
  const rels = character?.traits?.relationships;
  if (!rels || typeof rels !== "object" || Array.isArray(rels)) return 0;
  const fragSet = new Set(fragments.map((f) => f.toLowerCase()));
  let n = 0;
  for (const value of Object.values(rels)) {
    if (typeof value !== "string") continue;
    const lower = value.toLowerCase();
    for (const f of fragSet) {
      if (lower.includes(f)) { n += 1; break; }
    }
  }
  return n;
}

function classifyCharacterArchetype(character, { sceneShare = null } = {}) {
  if (!character || typeof character !== "object") {
    return {
      name: "",
      primary: { archetype: "ally", score: 0, signals: [] },
      candidates: [],
      summary: "Empty character.",
    };
  }
  const name = typeof character.name === "string" ? character.name : "";
  const traits = character.traits && typeof character.traits === "object" ? character.traits : {};
  const traitKeywords = Array.isArray(traits.keywords) ? traits.keywords : [];
  const emotionalDefault = typeof traits.emotional_default === "string" ? traits.emotional_default.trim().toLowerCase() : "";
  const tags = Array.isArray(character.tags) ? character.tags : [];

  const scores = {};
  const signals = {};
  for (const [archetype, lex] of Object.entries(ARCHETYPES)) {
    const sig = [];
    const keywordSet = new Set(lex.traitKeywords);
    const emotionalSet = new Set(lex.emotionalDefaults);
    const tagSet = new Set(lex.tags);

    let score = 0;
    const traitHits = intersectionCount(traitKeywords, keywordSet);
    if (traitHits > 0) {
      score += traitHits * 1.0;
      sig.push(`traits:${traitHits}`);
    }
    if (emotionalDefault && emotionalSet.has(emotionalDefault)) {
      score += 0.8;
      sig.push(`emotion:${emotionalDefault}`);
    }
    const tagHits = intersectionCount(tags, tagSet);
    if (tagHits > 0) {
      score += tagHits * 0.7;
      sig.push(`tags:${tagHits}`);
    }
    const relHits = relationshipLabelHits(character, lex.relationshipFragments);
    if (relHits > 0) {
      score += relHits * 0.6;
      sig.push(`relationships:${relHits}`);
    }
    // Scene share boosts archetypes whose minSceneShare threshold is
    // crossed (heroes, shadows show up a lot; thresholds barely).
    if (sceneShare !== null && Number.isFinite(sceneShare) && sceneShare >= lex.minSceneShare) {
      score += 0.5;
      sig.push(`scene-share:${sceneShare.toFixed(2)}`);
    }
    scores[archetype] = score * lex.weight;
    signals[archetype] = sig;
  }

  const totalRaw = Object.values(scores).reduce((a, b) => a + b, 0);
  const candidates = Object.entries(scores)
    .filter(([, s]) => s > 0)
    .map(([archetype, s]) => ({
      archetype,
      score: totalRaw > 0 ? Math.round((s / totalRaw) * 1000) / 1000 : 0,
      signals: signals[archetype],
    }))
    .sort((a, b) => b.score - a.score);

  // Default when no signals hit: ally with zero confidence.
  const primary = candidates[0] || { archetype: "ally", score: 0, signals: [] };
  // Damped confidence when runner-up is close.
  let primaryConfidence = primary.score;
  if (candidates.length >= 2 && candidates[1].score >= primary.score * 0.85) {
    primaryConfidence = Math.round(primaryConfidence * 0.7 * 1000) / 1000;
  }

  let summary;
  if (primary.score === 0) {
    summary = `${name || "Character"} has no archetype signal yet — defaulting to ally.`;
  } else if (primaryConfidence < 0.3) {
    summary = `${name} reads as ${primary.archetype} with mixed secondary signals.`;
  } else {
    summary = `${name} reads as ${primary.archetype}.`;
  }

  return {
    name,
    primary: { ...primary, score: primaryConfidence },
    candidates: candidates.slice(0, 4),
    summary,
  };
}

function classifyArchetypes({ characters = [] } = {}) {
  const list = Array.isArray(characters) ? characters : [];
  // Compute a per-character scene share if last_referenced is uniform.
  // V1 keeps this simple: equal share. The simulator (T-coverage-simulator)
  // owns true scene counts.
  const equalShare = list.length > 0 ? 1 / list.length : 0;
  const entries = list.map((c) => classifyCharacterArchetype(c, { sceneShare: equalShare }));
  return {
    schemaVersion: SCHEMA_VERSION,
    entries,
  };
}

export {
  classifyArchetypes,
  classifyCharacterArchetype,
  ARCHETYPES,
  SCHEMA_VERSION as ARCHETYPE_ENGINE_SCHEMA_VERSION,
};
