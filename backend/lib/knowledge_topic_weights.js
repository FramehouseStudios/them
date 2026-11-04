// Lexical topic ownership. Ambiguous craft words require screenplay context;
// they must not turn relationship or philosophy questions into writing lessons.
const KNOWLEDGE_TOPIC_KEYWORDS = Object.freeze({
  craft: ["dialogue", "screenwriting", "screenplay", "good scene", "setups", "payoffs", "slugline", "parenthetical", "inciting incident", "plot point", "midpoint", "act break", "logline", "three-act", "subtext"],
  movies: ["movie", "movies", "film", "cinema", "director", "screenplay", "editing", "scene"],
  art_history: ["art", "artist", "painting", "museum", "renaissance", "baroque", "modernism", "sculpture"],
  philosophy: ["philosophy", "ethics", "existential", "stoic", "meaning", "truth", "consciousness", "virtue", "plato", "aristotle", "socrates"],
  learning: ["learn", "learning", "study", "practice", "memory", "habit", "skill", "improve", "growth"],
  compatibility: ["compatibility", "values", "attachment", "fit", "alignment", "red flags", "green flags", "partner"],
  heartbreak: ["heartbreak", "heartbroken", "breakup", "break up", "broke up", "my ex", "ex partner", "ex-partner", "ex boyfriend", "ex girlfriend", "no contact", "closure"],
  friendship: ["friend", "friendship", "best friend", "support", "trust", "loyal", "repair"],
  betrayal: ["betrayal", "betrayed", "lie", "liar", "cheat", "disrespect", "trust broken", "deception"],
  empathy: ["empathy", "compassion", "attunement", "validation", "listening", "emotional safety"],
  human_connection: ["connection", "intimacy", "belonging", "lonely", "closeness", "bond", "relational"],
});

function isCraftKnowledgeQuery(text) {
  if (/\b(?:screenwriting|slugline|parenthetical|logline|three-act)\b/.test(text)) return true;
  return /\b(?:screenplay|script|movie|film|scene)\b/.test(text) &&
    /\b(?:dialogue|subtext|midpoint|setups|payoffs|plot|act|craft|good scene|screenplay)\b/.test(text);
}

function deriveKnowledgeTopicWeights(queryText) {
  const text = String(queryText || "").toLowerCase();
  const weights = {};
  const containsAny = (keywords) => keywords.some((keyword) => text.includes(keyword));
  for (const [topic, keywords] of Object.entries(KNOWLEDGE_TOPIC_KEYWORDS)) {
    if (topic === "craft" && !isCraftKnowledgeQuery(text)) continue;
    const hits = keywords.filter((keyword) => text.includes(keyword)).length;
    if (hits > 0) weights[topic] = Math.min(1, 0.28 + hits * 0.18);
  }
  if (containsAny(["relationship", "dating", "partner", "breakup"])) {
    weights.compatibility = Math.max(weights.compatibility || 0, 0.42);
    weights.human_connection = Math.max(weights.human_connection || 0, 0.38);
  }
  if (containsAny(["hurt", "betrayed", "liar", "lied"])) {
    weights.betrayal = Math.max(weights.betrayal || 0, 0.50);
    weights.empathy = Math.max(weights.empathy || 0, 0.32);
  }
  if (containsAny(["friend", "friendship", "best friend"])) {
    weights.friendship = Math.max(weights.friendship || 0, 0.48);
  }
  return weights;
}

export { deriveKnowledgeTopicWeights, isCraftKnowledgeQuery };
