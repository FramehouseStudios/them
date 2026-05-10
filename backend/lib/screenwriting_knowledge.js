import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENWRITING_CORPUS_ID = "canonical_screenwriting_craft";
const SCREENWRITING_EMBEDDING_MODEL = "text-embedding-3-small";
const SCREENWRITING_EMBEDDING_DIMENSIONS = 512;
const DEFAULT_CARDS_FILE = path.resolve(__dirname, "..", "knowledge_cards.json");
const DEFAULT_CACHE_FILE = path.resolve(__dirname, "..", "knowledge_embeddings_cache.json");

const SCREENWRITING_CRAFT_AREAS = Object.freeze([
  "dialogue_economy",
  "parentheticals",
  "sluglines",
  "action_lines",
  "exposition",
  "subtext",
  "irony",
  "planting_payoff",
  "want_need",
  "character_flaw",
  "genre_conventions",
  "formatting_fdx",
  "formatting_fountain",
  "act_structure",
  "beat_frameworks",
  "rewrite_diagnostics",
]);

const SCREENWRITING_GENRES = Object.freeze([
  "noir",
  "rom_com",
  "thriller",
  "horror",
  "prestige_tv_pilot",
  "half_hour_comedy",
  "drama",
  "sci_fi",
  "action",
  "mystery",
  "comedy",
  "romance",
]);

const CRAFT_AREA_ALIASES = Object.freeze({
  dialogue: "dialogue_economy",
  dialogue_rules: "dialogue_economy",
  dialogue_economy: "dialogue_economy",
  parenthetical: "parentheticals",
  parentheticals: "parentheticals",
  slugline: "sluglines",
  sluglines: "sluglines",
  scene_heading: "sluglines",
  scene_headings: "sluglines",
  action: "action_lines",
  action_line: "action_lines",
  action_lines: "action_lines",
  exposition: "exposition",
  subtext: "subtext",
  irony: "irony",
  planting: "planting_payoff",
  payoff: "planting_payoff",
  planting_payoff: "planting_payoff",
  chekov: "planting_payoff",
  chekhov: "planting_payoff",
  want_need: "want_need",
  want_vs_need: "want_need",
  character_flaw: "character_flaw",
  flaw: "character_flaw",
  genre: "genre_conventions",
  genre_conventions: "genre_conventions",
  fdx: "formatting_fdx",
  formatting_fdx: "formatting_fdx",
  fountain: "formatting_fountain",
  formatting_fountain: "formatting_fountain",
  structure: "act_structure",
  act_structure: "act_structure",
  beats: "beat_frameworks",
  beat_sheet: "beat_frameworks",
  beat_frameworks: "beat_frameworks",
  rewrite: "rewrite_diagnostics",
  rewrite_diagnostics: "rewrite_diagnostics",
});

const GENRE_ALIASES = Object.freeze({
  romcom: "rom_com",
  "rom-com": "rom_com",
  romantic_comedy: "rom_com",
  romance: "romance",
  thriller: "thriller",
  horror: "horror",
  noir: "noir",
  pilot: "prestige_tv_pilot",
  prestige: "prestige_tv_pilot",
  prestige_tv: "prestige_tv_pilot",
  prestige_tv_pilot: "prestige_tv_pilot",
  half_hour: "half_hour_comedy",
  half_hour_comedy: "half_hour_comedy",
  sitcom: "half_hour_comedy",
  comedy: "comedy",
  drama: "drama",
  sci_fi: "sci_fi",
  scifi: "sci_fi",
  science_fiction: "sci_fi",
  action: "action",
  mystery: "mystery",
});

function normalizeSnippet(value, maxChars = 600) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, Math.max(1, maxChars));
}

function normalizeToken(value) {
  return normalizeSnippet(value, 96)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCraftArea(value) {
  const token = normalizeToken(value);
  if (!token) return "";
  return CRAFT_AREA_ALIASES[token] || token;
}

function normalizeGenre(value) {
  const token = normalizeToken(value);
  if (!token) return "";
  return GENRE_ALIASES[token] || token;
}

function normalizeStringArray(value, maxItems = 12) {
  const source = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(/[|,]/g) : []);
  const out = [];
  for (const raw of source) {
    const item = normalizeSnippet(raw, 72).toLowerCase();
    if (!item) continue;
    if (!out.includes(item)) out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeProvenance(value) {
  const source = Array.isArray(value) ? value : (value ? [value] : []);
  const out = [];
  for (const row of source) {
    if (typeof row === "string") {
      const sourceText = normalizeSnippet(row, 120);
      if (sourceText) out.push({ source: sourceText, principle: sourceText });
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const sourceText = normalizeSnippet(row.source || row.name || row.work, 140);
    const principle = normalizeSnippet(row.principle || row.note || row.claim || row.title, 220);
    const locator = normalizeSnippet(row.locator || row.section || row.area, 120);
    if (!sourceText && !principle) continue;
    const item = {
      source: sourceText || "screenwriting craft corpus",
      principle: principle || sourceText,
    };
    if (locator) item.locator = locator;
    out.push(item);
  }
  return out.slice(0, 4);
}

function formatProvenance(provenance) {
  const rows = normalizeProvenance(provenance);
  if (!rows.length) return "";
  return rows
    .map((row) => {
      const bits = [row.source, row.locator].filter(Boolean).join(" / ");
      return row.principle ? `${bits}: ${row.principle}` : bits;
    })
    .filter(Boolean)
    .join("; ");
}

function hashSha256(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function buildKnowledgeCardEmbeddingText(card) {
  const provenance = formatProvenance(card?.provenance);
  return [
    `[topic] ${normalizeSnippet(card?.topic, 80)}`,
    `[craft_area] ${normalizeCraftArea(card?.craftArea || card?.craft_area || card?.area) || "none"}`,
    `[genre] ${normalizeStringArray(card?.genres || card?.genre).join(", ") || "none"}`,
    `[title] ${normalizeSnippet(card?.title, 180)}`,
    `[tags] ${normalizeStringArray(card?.tags).join(", ") || "none"}`,
    `[source] ${normalizeSnippet(card?.source, 120) || "screenwriting_corpus"}`,
    `[provenance] ${provenance || "none"}`,
    `[body] ${normalizeSnippet(card?.body, 2400)}`,
  ].join("\n");
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_err) {
    return null;
  }
}

function normalizeCard(card, idx = 0) {
  if (!card || typeof card !== "object") return null;
  const title = normalizeSnippet(card.title, 180);
  const body = normalizeSnippet(card.body, 1600);
  if (!title || !body) return null;
  const craftArea = normalizeCraftArea(card.craftArea || card.craft_area || card.area);
  const genres = normalizeStringArray(card.genres || card.genre).map(normalizeGenre).filter(Boolean);
  const out = {
    id: normalizeSnippet(card.id, 80) || `swc_${String(idx + 1).padStart(3, "0")}`,
    topic: normalizeToken(card.topic) || "screenwriting",
    title,
    body,
    tags: normalizeStringArray(card.tags, 16),
    level: normalizeToken(card.level) || "foundation",
    source: normalizeSnippet(card.source, 96) || "screenwriting_corpus",
    craftArea,
    genres: [...new Set(genres)],
    provenance: normalizeProvenance(card.provenance),
  };
  out.searchText = [
    out.topic,
    out.craftArea,
    out.title,
    out.body,
    out.tags.join(" "),
    out.genres.join(" "),
    formatProvenance(out.provenance),
  ].join(" ").toLowerCase();
  return out;
}

function loadKnowledgeCorpus({ cardsFile = DEFAULT_CARDS_FILE } = {}) {
  const json = loadJson(cardsFile);
  const rawCards = Array.isArray(json) ? json : (Array.isArray(json?.cards) ? json.cards : []);
  const cards = rawCards.map(normalizeCard).filter(Boolean);
  return {
    meta: Array.isArray(json) ? {} : (json || {}),
    cards,
    screenwritingCards: cards.filter((card) => (
      card.topic === "screenwriting" ||
      card.source === "screenwriting_corpus" ||
      /^swc_\d+/.test(card.id)
    )),
  };
}

function filterScreenwritingCards({
  cardsFile = DEFAULT_CARDS_FILE,
  cards = null,
  craftArea = "",
  genre = "",
  q = "",
  limit = 12,
} = {}) {
  const loaded = Array.isArray(cards) ? { screenwritingCards: cards.map(normalizeCard).filter(Boolean) } : loadKnowledgeCorpus({ cardsFile });
  const area = normalizeCraftArea(craftArea);
  const normalizedGenre = normalizeGenre(genre);
  const query = normalizeSnippet(q, 500).toLowerCase();
  const queryTokens = query
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  let rows = loaded.screenwritingCards.map((card) => {
    let score = 0;
    if (area && card.craftArea === area) score += 4;
    if (normalizedGenre && card.genres.includes(normalizedGenre)) score += 3;
    for (const token of queryTokens) {
      if (card.title.toLowerCase().includes(token)) score += 1.3;
      else if (card.tags.join(" ").includes(token)) score += 1.0;
      else if (card.searchText.includes(token)) score += 0.55;
    }
    if (!area && !normalizedGenre && !queryTokens.length) score += 0.1;
    return { ...card, score: Number(score.toFixed(4)) };
  });
  if (area) rows = rows.filter((card) => card.craftArea === area);
  if (normalizedGenre) rows = rows.filter((card) => card.genres.includes(normalizedGenre));
  if (queryTokens.length) rows = rows.filter((card) => card.score > 0 || queryTokens.some((token) => card.searchText.includes(token)));
  rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    filters: { craftArea: area, genre: normalizedGenre, q: query },
    cards: rows.slice(0, Math.max(1, Math.min(48, Number(limit || 12)))),
    total: rows.length,
  };
}

function buildCraftCardCitations(cards, maxItems = 5) {
  return (Array.isArray(cards) ? cards : [])
    .filter(Boolean)
    .slice(0, Math.max(1, Math.min(12, Number(maxItems || 5))))
    .map((card) => {
      const provenance = normalizeProvenance(card.provenance)[0] || {};
      return {
        id: `cite_${card.id}`,
        cardId: card.id,
        title: card.title,
        source: provenance.source || card.source || "screenwriting_corpus",
        principle: provenance.principle || card.body,
      };
    });
}

function buildCraftCardCitationBlock(cards, maxItems = 5) {
  const citations = buildCraftCardCitations(cards, maxItems);
  if (!citations.length) return "";
  return citations
    .map((c, idx) => `${idx + 1}. ${c.title} [${c.cardId}] - ${c.source}: ${c.principle}`)
    .join("\n");
}

function splitDraftLines(draft) {
  return String(draft || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

function pageForLine(lineNumber, linesPerPage = 55) {
  return Math.max(1, Math.ceil(Math.max(1, Number(lineNumber || 1)) / Math.max(1, Number(linesPerPage || 55))));
}

function findCard(cards, area, fallbackIndex = 0) {
  const normalized = normalizeCraftArea(area);
  return (Array.isArray(cards) ? cards : []).find((card) => card.craftArea === normalized) ||
    (Array.isArray(cards) ? cards[fallbackIndex] : null) ||
    null;
}

function makeCraftNote({ id, area, line, page, title, body, severity = "note", card }) {
  const citation = card ? buildCraftCardCitations([card], 1)[0] : null;
  const note = {
    id,
    page,
    lineStart: line,
    lineEnd: line,
    craftArea: normalizeCraftArea(area) || area,
    title,
    body,
    severity,
  };
  if (card?.id) note.cardId = card.id;
  if (citation) note.citation = `${citation.title} - ${citation.source}`;
  return note;
}

function buildScreenwritingCraftNoteAnchors({
  draft = "",
  cards = null,
  craftArea = "",
  genre = "",
  maxNotes = 8,
} = {}) {
  const lineList = splitDraftLines(draft);
  if (!lineList.some((line) => line.trim())) return [];
  const cardPool = Array.isArray(cards) && cards.length
    ? cards
    : filterScreenwritingCards({ craftArea, genre, q: draft, limit: 24 }).cards;
  const notes = [];
  const push = (note) => {
    if (!note || notes.some((existing) => existing.id === note.id)) return;
    notes.push(note);
  };

  for (let idx = 0; idx < lineList.length; idx += 1) {
    const lineNumber = idx + 1;
    const raw = lineList[idx] || "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const page = pageForLine(lineNumber);
    if (/^\(.{26,}\)$/.test(trimmed)) {
      const card = findCard(cardPool, "parentheticals");
      push(makeCraftNote({
        id: `craft_parenthetical_${lineNumber}`,
        area: "parentheticals",
        line: lineNumber,
        page,
        title: "Long parenthetical",
        body: "Parentheticals should usually clarify playable behavior, not carry subtext, emotion, or direction that belongs in action or dialogue.",
        severity: "warning",
        card,
      }));
    }
    if (/^(INT|EXT|EST|I\/E)\b/i.test(trimmed) && !/^(INT\.|EXT\.|EST\.|I\/E\.)\s+.+\s+-\s+.+/i.test(trimmed)) {
      const card = findCard(cardPool, "sluglines");
      push(makeCraftNote({
        id: `craft_slugline_${lineNumber}`,
        area: "sluglines",
        line: lineNumber,
        page,
        title: "Slugline grammar",
        body: "Scene headings are easier to parse when they keep location and time of day in the conventional INT./EXT. LOCATION - TIME pattern.",
        severity: "warning",
        card,
      }));
    }
    if (trimmed.length > 125 && !/^[A-Z0-9 ()'.-]{2,32}$/.test(trimmed)) {
      const card = findCard(cardPool, "action_lines");
      push(makeCraftNote({
        id: `craft_action_density_${lineNumber}`,
        area: "action_lines",
        line: lineNumber,
        page,
        title: "Dense action line",
        body: "Long action blocks slow the read; break visual action into crisp, playable images so the page keeps moving.",
        severity: "note",
        card,
      }));
    }
    if (/\b(explains|tells us|we learn|backstory|as you know|remember when)\b/i.test(trimmed)) {
      const card = findCard(cardPool, "exposition");
      push(makeCraftNote({
        id: `craft_exposition_${lineNumber}`,
        area: "exposition",
        line: lineNumber,
        page,
        title: "Exposition pressure",
        body: "When information arrives as explanation, convert it into conflict, behavior, withheld knowledge, or a choice with consequences.",
        severity: "warning",
        card,
      }));
    }
    if (/^[A-Z][A-Z0-9 '.-]{1,28}$/.test(trimmed)) {
      const next = (lineList[idx + 1] || "").trim();
      if (next.length > 150) {
        const card = findCard(cardPool, "dialogue_economy");
        push(makeCraftNote({
          id: `craft_dialogue_economy_${lineNumber + 1}`,
          area: "dialogue_economy",
          line: lineNumber + 1,
          page: pageForLine(lineNumber + 1),
          title: "Long dialogue run",
          body: "Dialogue gains force when each speech has a tactic, turn, or withheld layer; trim repeated setup and let the listener push back.",
          severity: "note",
          card,
        }));
      }
    }
    if (/\bsuddenly\b/i.test(trimmed)) {
      const card = findCard(cardPool, "planting_payoff");
      push(makeCraftNote({
        id: `craft_payoff_${lineNumber}`,
        area: "planting_payoff",
        line: lineNumber,
        page,
        title: "Payoff check",
        body: "If a turn feels sudden, plant the object, skill, weakness, or rule earlier so surprise reads as inevitable in hindsight.",
        severity: "note",
        card,
      }));
    }
    if (notes.length >= maxNotes) break;
  }
  return notes.slice(0, Math.max(1, Math.min(20, Number(maxNotes || 8))));
}

function buildFormattingLintWarnings({
  draft = "",
  format = "fountain",
  cards = null,
  maxWarnings = 10,
} = {}) {
  const lineList = splitDraftLines(draft);
  const cardPool = Array.isArray(cards) && cards.length
    ? cards
    : filterScreenwritingCards({ craftArea: String(format).toLowerCase().includes("fdx") ? "formatting_fdx" : "formatting_fountain", limit: 16 }).cards;
  const warnings = [];
  const add = (warning) => {
    if (!warning || warnings.some((item) => item.id === warning.id)) return;
    warnings.push(warning);
  };
  for (let idx = 0; idx < lineList.length; idx += 1) {
    const lineNumber = idx + 1;
    const trimmed = (lineList[idx] || "").trim();
    if (!trimmed) continue;
    const page = pageForLine(lineNumber);
    if (/^(int|ext|i\/e)\.? /i.test(trimmed) && trimmed !== trimmed.toUpperCase()) {
      const card = findCard(cardPool, "formatting_fountain");
      add({
        id: `lint_scene_heading_case_${lineNumber}`,
        page,
        lineStart: lineNumber,
        lineEnd: lineNumber,
        severity: "warning",
        craftArea: "formatting_fountain",
        title: "Scene heading case",
        body: "Fountain and FDX importers identify scene headings more reliably when standard headings are uppercase.",
        cardId: card?.id,
        citation: card ? buildCraftCardCitations([card], 1)[0]?.title : undefined,
      });
    }
    if (/^>.*<$/.test(trimmed)) {
      const card = findCard(cardPool, "formatting_fdx");
      add({
        id: `lint_transition_marker_${lineNumber}`,
        page,
        lineStart: lineNumber,
        lineEnd: lineNumber,
        severity: "note",
        craftArea: "formatting_fdx",
        title: "Fountain transition marker",
        body: "Forced transition markup should round-trip intentionally; verify it survives FDX export as a transition, not action.",
        cardId: card?.id,
        citation: card ? buildCraftCardCitations([card], 1)[0]?.title : undefined,
      });
    }
    if (/^\..+/.test(trimmed)) {
      const card = findCard(cardPool, "formatting_fountain");
      add({
        id: `lint_forced_heading_${lineNumber}`,
        page,
        lineStart: lineNumber,
        lineEnd: lineNumber,
        severity: "note",
        craftArea: "formatting_fountain",
        title: "Forced scene heading",
        body: "Forced heading syntax is valid Fountain, but imported FDX should preserve its element type rather than treating the dot as literal text.",
        cardId: card?.id,
        citation: card ? buildCraftCardCitations([card], 1)[0]?.title : undefined,
      });
    }
    if (warnings.length >= maxWarnings) break;
  }
  return warnings.map((warning) => {
    const clean = { ...warning };
    for (const key of Object.keys(clean)) {
      if (clean[key] === undefined || clean[key] === "") delete clean[key];
    }
    return clean;
  });
}

const GENRE_DOCTOR_FOCUS = Object.freeze({
  noir: ["moral pressure", "voiceover restraint", "fatal choice"],
  rom_com: ["meet-cute pressure", "comic obstacle", "earned vulnerability"],
  thriller: ["ticking pressure", "information asymmetry", "reversal cadence"],
  horror: ["dread escalation", "rules of threat", "body-level stakes"],
  prestige_tv_pilot: ["engine clarity", "ensemble desire lines", "season question"],
  half_hour_comedy: ["comic engine", "button rhythm", "relationship reset"],
  drama: ["emotional causality", "want versus need", "choice cost"],
  sci_fi: ["world rule clarity", "human stakes", "speculative payoff"],
  action: ["spatial clarity", "set-piece escalation", "tactical reversals"],
  mystery: ["clue fairness", "red herring logic", "reveal sequencing"],
  comedy: ["comic premise pressure", "escalation", "button payoff"],
  romance: ["vulnerability stakes", "obstacle specificity", "choice of love"],
});

function buildGenreDoctorPasses({
  genre = "",
  draft = "",
  cards = null,
  maxPasses = 3,
} = {}) {
  const normalizedGenre = normalizeGenre(genre) || "drama";
  const cardPool = Array.isArray(cards) && cards.length
    ? cards
    : filterScreenwritingCards({ genre: normalizedGenre, limit: 12 }).cards;
  const focuses = GENRE_DOCTOR_FOCUS[normalizedGenre] || GENRE_DOCTOR_FOCUS.drama;
  const draftHasMidpoint = /\b(midpoint|reversal|false victory|false defeat)\b/i.test(draft);
  const draftHasClimax = /\b(climax|finale|final confrontation|showdown)\b/i.test(draft);
  const base = [
    {
      id: `doctor_${normalizedGenre}_promise`,
      genre: normalizedGenre,
      title: "Genre promise pass",
      body: `Track whether every ten pages refreshes the ${focuses[0]} expected by this genre without repeating the same story move.`,
    },
    {
      id: `doctor_${normalizedGenre}_pressure`,
      genre: normalizedGenre,
      title: "Escalation pass",
      body: `Audit ${focuses[1]} scene by scene: each scene should tighten the problem, reveal new cost, or force a harder choice.`,
    },
    {
      id: `doctor_${normalizedGenre}_turns`,
      genre: normalizedGenre,
      title: "Turn clarity pass",
      body: `${draftHasMidpoint ? "Midpoint language is present." : "Midpoint language is not obvious."} ${draftHasClimax ? "Climax language is present." : "Climax language is not obvious."} Make the major turns visible through irreversible action, not explanation.`,
    },
  ];
  return base.slice(0, Math.max(1, Math.min(6, Number(maxPasses || 3)))).map((pass, idx) => {
    const citationCards = cardPool.slice(idx * 2, idx * 2 + 2);
    return {
      ...pass,
      craftArea: idx === 2 ? "act_structure" : "genre_conventions",
      cardIds: citationCards.map((card) => card.id),
      citations: buildCraftCardCitations(citationCards, 2),
    };
  });
}

function validateEmbeddingCache({
  cardsFile = DEFAULT_CARDS_FILE,
  cacheFile = DEFAULT_CACHE_FILE,
  model = SCREENWRITING_EMBEDDING_MODEL,
  dimensions = SCREENWRITING_EMBEDDING_DIMENSIONS,
  requireScreenwritingCorpus = true,
} = {}) {
  const corpus = loadKnowledgeCorpus({ cardsFile });
  const cards = corpus.screenwritingCards;
  const cache = loadJson(cacheFile) || {};
  const vectors = cache.vectors && typeof cache.vectors === "object" ? cache.vectors : {};
  const missingVectors = [];
  const staleVectors = [];
  const wrongModelVectors = [];
  const badDimensionVectors = [];
  const zeroNormVectors = [];
  for (const card of cards) {
    const row = vectors[card.id];
    const expectedHash = hashSha256(buildKnowledgeCardEmbeddingText(card));
    if (!row) {
      missingVectors.push(card.id);
      continue;
    }
    if (String(row.hash || "") !== expectedHash) staleVectors.push(card.id);
    if (String(row.model || "") !== model) wrongModelVectors.push(card.id);
    const vector = Array.isArray(row.vector) ? row.vector : [];
    const dims = Number(row.dimensions || vector.length || 0);
    if (dims !== dimensions || vector.length !== dimensions) badDimensionVectors.push(card.id);
    const norm = Number(row.norm || 0);
    if (!Number.isFinite(norm) || norm <= 0) zeroNormVectors.push(card.id);
  }
  const areaCounts = Object.fromEntries(SCREENWRITING_CRAFT_AREAS.map((area) => [area, 0]));
  const genreCounts = Object.fromEntries(SCREENWRITING_GENRES.map((genre) => [genre, 0]));
  let provenanceCount = 0;
  for (const card of cards) {
    if (areaCounts[card.craftArea] !== undefined) areaCounts[card.craftArea] += 1;
    for (const genre of card.genres) {
      if (genreCounts[genre] !== undefined) genreCounts[genre] += 1;
    }
    if (normalizeProvenance(card.provenance).length) provenanceCount += 1;
  }
  const corpusCountOk = cards.length >= 200 && cards.length <= 400;
  const coverageOk = SCREENWRITING_CRAFT_AREAS.every((area) => areaCounts[area] > 0);
  const provenanceOk = cards.length > 0 && provenanceCount === cards.length;
  const embeddingFresh = (
    cards.length > 0 &&
    missingVectors.length === 0 &&
    staleVectors.length === 0 &&
    wrongModelVectors.length === 0 &&
    badDimensionVectors.length === 0 &&
    zeroNormVectors.length === 0
  );
  const ready = (!requireScreenwritingCorpus || (corpusCountOk && coverageOk && provenanceOk)) && embeddingFresh;
  return {
    ready,
    corpusId: corpus.meta?.corpus || corpus.meta?.id || "",
    cardCount: cards.length,
    corpusCountOk,
    coverageOk,
    provenanceOk,
    provenanceCount,
    areaCounts,
    genreCounts,
    embeddingFresh,
    cacheFile,
    cardsFile,
    model,
    dimensions,
    cacheMeta: cache.meta || {},
    missingVectors,
    staleVectors,
    wrongModelVectors,
    badDimensionVectors,
    zeroNormVectors,
  };
}

function buildReleaseReadinessArtifact(options = {}) {
  const validation = validateEmbeddingCache(options);
  return {
    generatedAt: new Date().toISOString(),
    releaseGate: "screenwriting_corpus_embedding_cache",
    ready: validation.ready,
    corpus: {
      id: validation.corpusId || SCREENWRITING_CORPUS_ID,
      cardCount: validation.cardCount,
      countRange: "200-400",
      countOk: validation.corpusCountOk,
      coverageOk: validation.coverageOk,
      provenanceOk: validation.provenanceOk,
      provenanceCount: validation.provenanceCount,
      areaCounts: validation.areaCounts,
      genreCounts: validation.genreCounts,
    },
    embeddings: {
      model: validation.model,
      dimensions: validation.dimensions,
      fresh: validation.embeddingFresh,
      cacheFile: validation.cacheFile,
      cacheMeta: validation.cacheMeta,
      missingCount: validation.missingVectors.length,
      staleCount: validation.staleVectors.length,
      wrongModelCount: validation.wrongModelVectors.length,
      badDimensionCount: validation.badDimensionVectors.length,
      zeroNormCount: validation.zeroNormVectors.length,
      missingSample: validation.missingVectors.slice(0, 12),
      staleSample: validation.staleVectors.slice(0, 12),
    },
  };
}

export {
  SCREENWRITING_CORPUS_ID,
  SCREENWRITING_EMBEDDING_MODEL,
  SCREENWRITING_EMBEDDING_DIMENSIONS,
  SCREENWRITING_CRAFT_AREAS,
  SCREENWRITING_GENRES,
  normalizeSnippet,
  normalizeCraftArea,
  normalizeGenre,
  normalizeProvenance,
  formatProvenance,
  hashSha256,
  buildKnowledgeCardEmbeddingText,
  loadKnowledgeCorpus,
  filterScreenwritingCards,
  buildCraftCardCitations,
  buildCraftCardCitationBlock,
  buildScreenwritingCraftNoteAnchors,
  buildFormattingLintWarnings,
  buildGenreDoctorPasses,
  validateEmbeddingCache,
  buildReleaseReadinessArtifact,
};
